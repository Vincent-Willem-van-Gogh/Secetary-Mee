use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, Wave};
use std::io::{self, BufReader, Read, Write};
use std::path::{Path, PathBuf};

const AUDIO: u8 = 1;
const RESET: u8 = 2;
const SHUTDOWN: u8 = 3;
const MAX_FRAME_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, PartialEq)]
enum Frame {
    Audio(Vec<f32>),
    Reset,
    Shutdown,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Output<'a> {
    Ready,
    Draft { text: &'a str, revision: u64 },
    Cleared { revision: u64 },
    Error { message: &'a str },
}

fn read_frame(reader: &mut impl Read) -> Result<Option<Frame>> {
    let mut header = [0_u8; 5];
    match reader.read_exact(&mut header) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error.into()),
    }
    let length = u32::from_le_bytes(header[1..5].try_into().unwrap()) as usize;
    if length > MAX_FRAME_BYTES {
        bail!("frame is too large: {length} bytes");
    }
    let mut payload = vec![0_u8; length];
    reader.read_exact(&mut payload)?;
    match header[0] {
        AUDIO if length % 4 == 0 => Ok(Some(Frame::Audio(
            payload
                .chunks_exact(4)
                .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
                .collect(),
        ))),
        AUDIO => bail!("audio payload length must be divisible by four"),
        RESET if length == 0 => Ok(Some(Frame::Reset)),
        SHUTDOWN if length == 0 => Ok(Some(Frame::Shutdown)),
        kind => bail!("invalid frame kind {kind} or payload length {length}"),
    }
}

fn emit(value: &Output<'_>) -> Result<()> {
    let stdout = io::stdout();
    let mut out = stdout.lock();
    serde_json::to_writer(&mut out, value)?;
    out.write_all(b"\n")?;
    out.flush()?;
    Ok(())
}

fn model_file(model_dir: &Path, name: &str) -> String {
    model_dir.join(name).to_string_lossy().into_owned()
}

fn recognizer(model_dir: &Path) -> Result<OnlineRecognizer> {
    let mut config = OnlineRecognizerConfig::default();
    config.model_config.transducer.encoder = Some(model_file(
        model_dir,
        "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
    ));
    config.model_config.transducer.decoder = Some(model_file(
        model_dir,
        "decoder-epoch-99-avg-1-chunk-16-left-128.onnx",
    ));
    config.model_config.transducer.joiner = Some(model_file(
        model_dir,
        "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
    ));
    config.model_config.tokens = Some(model_file(model_dir, "tokens.txt"));
    config.model_config.model_type = Some("zipformer2".into());
    config.model_config.modeling_unit = Some("bpe".into());
    config.model_config.bpe_vocab = Some(model_file(model_dir, "bpe.model"));
    config.model_config.num_threads = 2;
    config.decoding_method = Some("greedy_search".into());
    config.enable_endpoint = true;
    config.rule1_min_trailing_silence = 2.4;
    config.rule2_min_trailing_silence = 1.2;
    config.rule3_min_utterance_length = 20.0;
    OnlineRecognizer::create(&config).context("failed to create Sherpa online recognizer")
}

fn run(model_dir: PathBuf) -> Result<()> {
    let recognizer = recognizer(&model_dir)?;
    let mut stream = recognizer.create_stream();
    let mut last_text = String::new();
    let mut revision = 0_u64;
    emit(&Output::Ready)?;

    let stdin = io::stdin();
    let mut input = BufReader::new(stdin.lock());
    while let Some(frame) = read_frame(&mut input)? {
        match frame {
            Frame::Audio(samples) => {
                stream.accept_waveform(16_000, &samples);
                while recognizer.is_ready(&stream) {
                    recognizer.decode(&stream);
                }
                if let Some(result) = recognizer.get_result(&stream) {
                    let text = result.text.trim();
                    if !text.is_empty() && text != last_text {
                        revision += 1;
                        last_text = text.to_owned();
                        emit(&Output::Draft { text, revision })?;
                    }
                }
                if recognizer.is_endpoint(&stream) {
                    recognizer.reset(&stream);
                    last_text.clear();
                }
            }
            Frame::Reset => {
                recognizer.reset(&stream);
                stream = recognizer.create_stream();
                last_text.clear();
                revision += 1;
                emit(&Output::Cleared { revision })?;
            }
            Frame::Shutdown => break,
        }
    }
    Ok(())
}

fn smoke_test(model_dir: &Path, wave_path: &Path) -> Result<()> {
    let recognizer = recognizer(model_dir)?;
    let stream = recognizer.create_stream();
    let wave_path = wave_path.to_string_lossy();
    let wave = Wave::read(&wave_path).context("failed to read smoke-test wave")?;
    stream.accept_waveform(wave.sample_rate(), wave.samples());
    stream.input_finished();
    while recognizer.is_ready(&stream) {
        recognizer.decode(&stream);
    }
    let text = recognizer
        .get_result(&stream)
        .map(|result| result.text.trim().to_owned())
        .filter(|text| !text.is_empty())
        .context("Sherpa smoke test produced no English text")?;
    println!("{text}");
    Ok(())
}

fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let result = if args.first().is_some_and(|arg| arg == "--smoke-test") {
        match (args.get(1), args.get(2)) {
            (Some(model), Some(wave)) => smoke_test(Path::new(model), Path::new(wave)),
            _ => Err(anyhow!(
                "usage: sherpa-helper --smoke-test <model-directory> <wave-file>"
            )),
        }
    } else {
        args.first()
            .map(PathBuf::from)
            .context("usage: sherpa-helper <model-directory>")
            .and_then(run)
    };
    if let Err(error) = result {
        let message = format!("{error:#}");
        let _ = emit(&Output::Error { message: &message });
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_audio_and_control_frames() {
        let mut bytes = vec![AUDIO, 8, 0, 0, 0];
        bytes.extend_from_slice(&1.25_f32.to_le_bytes());
        bytes.extend_from_slice(&(-0.5_f32).to_le_bytes());
        bytes.extend_from_slice(&[RESET, 0, 0, 0, 0, SHUTDOWN, 0, 0, 0, 0]);
        let mut input = bytes.as_slice();
        assert_eq!(
            read_frame(&mut input).unwrap(),
            Some(Frame::Audio(vec![1.25, -0.5]))
        );
        assert_eq!(read_frame(&mut input).unwrap(), Some(Frame::Reset));
        assert_eq!(read_frame(&mut input).unwrap(), Some(Frame::Shutdown));
    }

    #[test]
    fn rejects_misaligned_audio() {
        let mut input = [AUDIO, 1, 0, 0, 0, 0].as_slice();
        assert!(read_frame(&mut input).is_err());
    }
}
