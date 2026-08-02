use std::pin::Pin;
use std::task::{Context, Poll};
use futures_util::{Stream, StreamExt};
use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait};


#[cfg(any(target_os = "macos", target_os = "linux"))]
use futures_channel::mpsc;
#[cfg(target_os = "macos")]
use super::core_audio::CoreAudioCapture;
#[cfg(target_os = "macos")]
use log::info;

/// System audio capture using Core Audio tap (macOS) or CPAL (other platforms)
pub struct SystemAudioCapture {
    _host: cpal::Host,
}

impl SystemAudioCapture {
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();
        Ok(Self { _host: host })
    }

    pub fn list_system_devices() -> Result<Vec<String>> {
        #[cfg(target_os = "linux")]
        return Ok(vec!["Default System Audio".to_string()]);

        #[cfg(not(target_os = "linux"))]
        {
        let host = cpal::default_host();
        let devices = host.output_devices()
            .map_err(|e| anyhow::anyhow!("Failed to enumerate output devices: {}", e))?;

        let mut device_names = Vec::new();
        for device in devices {
            if let Ok(name) = device.name() {
                device_names.push(name);
            }
        }

        Ok(device_names)
        }
    }

    pub fn start_system_audio_capture(&self) -> Result<SystemAudioStream> {
        #[cfg(target_os = "macos")]
        {
            info!("Starting Core Audio system capture (macOS)");
            // Use Core Audio tap for system audio capture
            let core_audio = CoreAudioCapture::new()?;
            let core_audio_stream = core_audio.stream()?;
            let sample_rate = core_audio_stream.sample_rate();

            // Convert CoreAudioStream to SystemAudioStream
            let (tx, rx) = mpsc::unbounded::<Vec<f32>>();
            let (drop_tx, drop_rx) = std::sync::mpsc::channel::<()>();

            // Spawn task to forward Core Audio samples
            tokio::spawn(async move {
                use futures_util::StreamExt;
                let mut stream = core_audio_stream;
                let mut buffer = Vec::new();
                let chunk_size = 1024;

                loop {
                    // Check if we should stop
                    if drop_rx.try_recv().is_ok() {
                        break;
                    }

                    // Poll the Core Audio stream
                    match stream.next().await {
                        Some(sample) => {
                            buffer.push(sample);
                            if buffer.len() >= chunk_size {
                                if tx.unbounded_send(buffer.clone()).is_err() {
                                    break;
                                }
                                buffer.clear();
                            }
                        }
                        None => break,
                    }
                }

                // Send any remaining samples
                if !buffer.is_empty() {
                    let _ = tx.unbounded_send(buffer);
                }
            });

            let receiver = rx.map(futures_util::stream::iter).flatten();

            info!("Core Audio system capture started successfully");

            Ok(SystemAudioStream {
                drop_tx,
                sample_rate,
                receiver: Box::pin(receiver),
            })
        }

        #[cfg(target_os = "linux")]
        {
            use libpulse_binding::{sample, stream::Direction};
            use libpulse_simple_binding::Simple;

            let (mut tx, rx) = mpsc::channel::<Vec<f32>>(8);
            let (drop_tx, drop_rx) = std::sync::mpsc::channel::<()>();
            let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel(1);

            std::thread::Builder::new()
                .name("pulse-monitor-capture".to_string())
                .spawn(move || {
                    let spec = sample::Spec {
                        format: sample::Format::FLOAT32NE,
                        channels: 2,
                        rate: 48_000,
                    };

                    let simple = match Simple::new(
                        None,
                        "Secretary Mee",
                        Direction::Record,
                        Some("@DEFAULT_MONITOR@"),
                        "System Audio",
                        &spec,
                        None,
                        None,
                    ) {
                        Ok(simple) => {
                            let _ = ready_tx.send(Ok::<(), String>(()));
                            simple
                        }
                        Err(error) => {
                            let _ = ready_tx.send(Err(format!(
                                "Unable to connect to PulseAudio default monitor: {error}"
                            )));
                            return;
                        }
                    };

                    // 20 ms of 48 kHz stereo float audio keeps stop latency bounded.
                    let mut bytes = vec![0_u8; 48_000 * 2 * 4 / 50];
                    loop {
                        if drop_rx.try_recv().is_ok() {
                            break;
                        }
                        if let Err(error) = simple.read(&mut bytes) {
                            log::error!("PulseAudio monitor read failed: {error}");
                            break;
                        }

                        let samples = bytes
                            .chunks_exact(4)
                            .map(|sample| f32::from_ne_bytes(sample.try_into().unwrap()))
                            .collect();
                        if let Err(error) = tx.try_send(samples) {
                            if error.is_disconnected() {
                                break;
                            }
                            log::warn!("PulseAudio monitor queue full; dropping one system-audio frame");
                        }
                    }
                })
                .map_err(|error| anyhow::anyhow!("Failed to start PulseAudio capture thread: {error}"))?;

            ready_rx
                .recv_timeout(std::time::Duration::from_secs(5))
                .map_err(|_| anyhow::anyhow!("Timed out connecting to PulseAudio default monitor"))?
                .map_err(anyhow::Error::msg)?;

            let receiver = rx.map(futures_util::stream::iter).flatten();
            Ok(SystemAudioStream {
                drop_tx,
                sample_rate: 48_000,
                receiver: Box::pin(receiver),
            })
        }

        #[cfg(target_os = "windows")]
        {
            anyhow::bail!("Use the selected WASAPI output endpoint for loopback capture")
        }
    }

    pub fn check_system_audio_permissions() -> bool {
        // Check if we can enumerate audio devices
        match cpal::default_host().output_devices() {
            Ok(_) => true,
            Err(_) => false,
        }
    }
}

pub struct SystemAudioStream {
    drop_tx: std::sync::mpsc::Sender<()>,
    sample_rate: u32,
    receiver: Pin<Box<dyn Stream<Item = f32> + Send + Sync>>,
}

impl Drop for SystemAudioStream {
    fn drop(&mut self) {
        let _ = self.drop_tx.send(());
    }
}

impl Stream for SystemAudioStream {
    type Item = f32;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.receiver.as_mut().poll_next_unpin(cx)
    }
}

impl SystemAudioStream {
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}

/// Public interface for system audio capture
pub async fn start_system_audio_capture() -> Result<SystemAudioStream> {
    let capture = SystemAudioCapture::new()?;
    capture.start_system_audio_capture()
}

pub fn list_system_audio_devices() -> Result<Vec<String>> {
    SystemAudioCapture::list_system_devices()
}

pub fn check_system_audio_permissions() -> bool {
    SystemAudioCapture::check_system_audio_permissions()
}
