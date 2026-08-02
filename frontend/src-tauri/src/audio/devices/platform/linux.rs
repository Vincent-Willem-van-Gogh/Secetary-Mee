use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait};

use crate::audio::devices::configuration::{AudioDevice, DeviceType};

/// Configure Linux audio devices using ALSA/PulseAudio
pub fn configure_linux_audio(host: &cpal::Host) -> Result<Vec<AudioDevice>> {
    let mut devices = Vec::new();

    // Add input devices
    for device in host.input_devices()? {
        if let Ok(name) = device.name() {
            devices.push(AudioDevice::new(name, DeviceType::Input));
        }
    }

    // PulseAudio and pipewire-pulse expose the default output through this
    // stable monitor alias, so Linux v1 does not need a routing UI.
    devices.push(AudioDevice::new(
        "Default System Audio".to_string(),
        DeviceType::Output,
    ));

    Ok(devices)
}
