use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

const MODEL_NAME: &str = "sherpa-onnx-streaming-zipformer-en-2023-06-26";
const ARCHIVE_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26.tar.bz2";
const ARCHIVE_SHA256: &str = "639e25b578e9e997131402199419c13a941f8e4e198e2da1ce57dbf5cf401282";
const ARCHIVE_BYTES: u64 = 310_414_022;
const REQUIRED_FILES: [&str; 5] = [
    "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
    "decoder-epoch-99-avg-1-chunk-16-left-128.onnx",
    "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
    "tokens.txt",
    "bpe.model",
];

static MODELS_DIR: LazyLock<Mutex<Option<PathBuf>>> = LazyLock::new(|| Mutex::new(None));
static APP: LazyLock<Mutex<Option<AppHandle>>> = LazyLock::new(|| Mutex::new(None));
static AUDIO_SENDER: LazyLock<Mutex<Option<mpsc::Sender<Input>>>> =
    LazyLock::new(|| Mutex::new(None));
static SESSION: LazyLock<tokio::sync::Mutex<Option<Session>>> =
    LazyLock::new(|| tokio::sync::Mutex::new(None));
static DOWNLOAD_ACTIVE: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);
static OVERFLOWED: AtomicBool = AtomicBool::new(false);
static REVISION: AtomicU64 = AtomicU64::new(0);
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);
static LATEST_UPDATE: LazyLock<Mutex<LiveDraftUpdate>> = LazyLock::new(|| {
    Mutex::new(LiveDraftUpdate {
        state: "idle",
        text: String::new(),
        revision: 0,
        error: None,
    })
});

#[derive(Debug)]
enum Input {
    Audio(Vec<f32>),
    Reset,
    Shutdown,
}

struct Session {
    id: u64,
    sender: mpsc::Sender<Input>,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Clone, Debug, Serialize)]
pub struct LiveDraftUpdate {
    pub state: &'static str,
    pub text: String,
    pub revision: u64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct LivePreviewModelStatus {
    pub model_name: &'static str,
    pub state: &'static str,
    pub ready: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum HelperOutput {
    Ready,
    Draft { text: String, revision: u64 },
    Cleared { revision: u64 },
    Error { message: String },
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: f64,
}

pub fn initialize(app: &AppHandle) {
    let app_data = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data directory");
    let models = app_data.join("models");
    if let Err(error) = std::fs::create_dir_all(&models) {
        log::error!("Failed to initialize live preview model directory: {error}");
    }
    *MODELS_DIR.lock().unwrap() = Some(models);
    *APP.lock().unwrap() = Some(app.clone());
}

fn models_dir() -> Result<PathBuf, String> {
    MODELS_DIR
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Live preview models directory is not initialized".into())
}

fn model_dir() -> Result<PathBuf, String> {
    Ok(models_dir()?.join(MODEL_NAME))
}

fn model_ready_at(path: &Path) -> bool {
    REQUIRED_FILES.iter().all(|name| path.join(name).is_file())
}

fn emit_update(state: &'static str, text: impl Into<String>, error: Option<String>) {
    let revision = REVISION.fetch_add(1, Ordering::Relaxed) + 1;
    let update = LiveDraftUpdate {
        state,
        text: text.into(),
        revision,
        error,
    };
    *LATEST_UPDATE.lock().unwrap() = update.clone();
    if let Some(app) = APP.lock().unwrap().as_ref() {
        let _ = app.emit("live-draft-update", update);
    }
}

#[tauri::command]
pub fn get_live_preview_status() -> LiveDraftUpdate {
    LATEST_UPDATE.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_live_preview_model_status() -> Result<LivePreviewModelStatus, String> {
    let ready = model_ready_at(&model_dir()?);
    Ok(LivePreviewModelStatus {
        model_name: MODEL_NAME,
        state: if DOWNLOAD_ACTIVE.load(Ordering::Relaxed) {
            "downloading"
        } else if ready {
            "ready"
        } else {
            "missing"
        },
        ready,
        size_bytes: ARCHIVE_BYTES,
    })
}

#[tauri::command]
pub async fn download_live_preview_model(app: AppHandle) -> Result<(), String> {
    if DOWNLOAD_ACTIVE.swap(true, Ordering::SeqCst) {
        return Err("Live preview model download is already running".into());
    }
    DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);
    let result = download_model(&app).await;
    DOWNLOAD_ACTIVE.store(false, Ordering::SeqCst);
    result
}

async fn download_model(app: &AppHandle) -> Result<(), String> {
    let root = models_dir()?;
    let archive = root.join(format!(".{MODEL_NAME}.tar.bz2"));
    let staging = root.join(format!(".{MODEL_NAME}.staging"));
    let response = reqwest::get(ARCHIVE_URL)
        .await
        .map_err(|error| format!("Could not download Sherpa model: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Sherpa model server returned an error: {error}"))?;
    let mut file = tokio::fs::File::create(&archive)
        .await
        .map_err(|e| e.to_string())?;
    let mut downloaded = 0_u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if DOWNLOAD_CANCELLED.load(Ordering::Relaxed) {
            let _ = tokio::fs::remove_file(&archive).await;
            return Err("Live preview model download cancelled".into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "live-preview-model-download-progress",
            DownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: ARCHIVE_BYTES,
                percent: downloaded as f64 / ARCHIVE_BYTES as f64 * 100.0,
            },
        );
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    let archive_for_check = archive.clone();
    let digest = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let mut input = std::fs::File::open(archive_for_check).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        std::io::copy(&mut input, &mut hasher).map_err(|e| e.to_string())?;
        Ok(format!("{:x}", hasher.finalize()))
    })
    .await
    .map_err(|e| e.to_string())??;
    if downloaded != ARCHIVE_BYTES || digest != ARCHIVE_SHA256 {
        let _ = tokio::fs::remove_file(&archive).await;
        return Err("Sherpa model archive failed size or SHA-256 validation".into());
    }

    let archive_for_extract = archive.clone();
    let staging_for_extract = staging.clone();
    tokio::task::spawn_blocking(move || {
        extract_required_files(&archive_for_extract, &staging_for_extract)
    })
    .await
    .map_err(|e| e.to_string())??;
    if !model_ready_at(&staging) {
        return Err("Sherpa model archive is missing required runtime files".into());
    }
    let destination = model_dir()?;
    if destination.exists() {
        std::fs::remove_dir_all(&destination).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&staging, &destination).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&archive);
    let _ = app.emit(
        "live-preview-model-download-completed",
        get_live_preview_model_status()?,
    );
    Ok(())
}

fn extract_required_files(archive: &Path, staging: &Path) -> Result<(), String> {
    if staging.exists() {
        std::fs::remove_dir_all(staging).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(staging).map_err(|e| e.to_string())?;
    let input = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let decoder = bzip2::read::BzDecoder::new(input);
    for entry in tar::Archive::new(decoder)
        .entries()
        .map_err(|e| e.to_string())?
    {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        if path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return Err("Unsafe path in Sherpa model archive".into());
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if REQUIRED_FILES.contains(&name) {
            let mut output =
                std::fs::File::create(staging.join(name)).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_live_preview_model_download() {
    DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn delete_live_preview_model() -> Result<(), String> {
    stop_session().await;
    let path = model_dir()?;
    if path.exists() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn helper_path(app: &AppHandle) -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let executable_dir = executable.parent().unwrap_or_else(|| Path::new("."));
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let target = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else {
        "unknown-target"
    };
    let names = [
        format!("sherpa-helper{suffix}"),
        format!("sherpa-helper-{target}{suffix}"),
    ];
    let mut candidates: Vec<PathBuf> = names.iter().map(|name| executable_dir.join(name)).collect();
    if let Ok(resources) = app.path().resource_dir() {
        candidates.extend(names.iter().map(|name| resources.join(name)));
    }
    let workspace_target = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target");
    candidates.push(workspace_target.join("release").join(&names[0]));
    candidates.push(workspace_target.join("debug").join(&names[0]));
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "Sherpa live preview helper is not installed".into())
}

pub async fn start_session(app: &AppHandle) -> Result<u64, String> {
    stop_session().await;
    let model = model_dir()?;
    if !model_ready_at(&model) {
        return Err("LIVE_PREVIEW_MODEL_MISSING".into());
    }
    emit_update("loading", "", None);
    let helper = helper_path(app)?;
    let mut child = Command::new(helper)
        .arg(model)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Could not start Sherpa helper: {e}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or("Sherpa helper stdin is unavailable")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Sherpa helper stdout is unavailable")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Sherpa helper stderr is unavailable")?;
    let stderr_task = tokio::spawn(async move {
        let mut message = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut message).await;
        message
    });
    let mut lines = BufReader::new(stdout).lines();
    let first = tokio::time::timeout(std::time::Duration::from_secs(30), lines.next_line())
        .await
        .map_err(|_| "Sherpa helper timed out while loading the model".to_string())?
        .map_err(|e| e.to_string())?
        .ok_or("Sherpa helper exited before becoming ready")?;
    if !matches!(
        serde_json::from_str::<HelperOutput>(&first),
        Ok(HelperOutput::Ready)
    ) {
        return Err(format!("Sherpa helper failed to load: {first}"));
    }

    let session_id = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    let (sender, mut receiver) = mpsc::channel::<Input>(64);
    let task = tokio::spawn(async move {
        let mut expected_shutdown = false;
        let mut helper_reported_error = false;
        let mut unexpected_error = None;
        loop {
            tokio::select! {
                input = receiver.recv() => {
                    let Some(input) = input else {
                        expected_shutdown = true;
                        break;
                    };
                    if OVERFLOWED.swap(false, Ordering::SeqCst) {
                        if let Err(error) = write_frame(&mut stdin, 2, &[]).await {
                            unexpected_error = Some(format!("Could not reset Sherpa helper: {error}"));
                            break;
                        }
                    }
                    let result = match input {
                        Input::Audio(samples) => {
                            let bytes: &[u8] = bytemuck::cast_slice(&samples);
                            write_frame(&mut stdin, 1, bytes).await
                        }
                        Input::Reset => write_frame(&mut stdin, 2, &[]).await,
                        Input::Shutdown => {
                            expected_shutdown = true;
                            let _ = write_frame(&mut stdin, 3, &[]).await;
                            break;
                        }
                    };
                    if let Err(error) = result {
                        unexpected_error = Some(format!("Could not send audio to Sherpa helper: {error}"));
                        break;
                    }
                }
                line = lines.next_line() => {
                    match line {
                        Ok(Some(line)) => helper_reported_error |= handle_helper_output(&line),
                        Ok(None) => {
                            unexpected_error = Some("Sherpa helper exited unexpectedly".into());
                            break;
                        }
                        Err(error) => {
                            unexpected_error = Some(format!("Could not read Sherpa helper output: {error}"));
                            break;
                        }
                    }
                }
            }
        }
        let _ = child.kill().await;
        let stderr = stderr_task.await.unwrap_or_default();
        if !expected_shutdown {
            let is_current = SESSION
                .lock()
                .await
                .as_ref()
                .is_some_and(|session| session.id == session_id);
            if is_current {
                *AUDIO_SENDER.lock().unwrap() = None;
                if !helper_reported_error {
                    let mut message = unexpected_error
                        .unwrap_or_else(|| "Sherpa helper stopped unexpectedly".into());
                    if !stderr.trim().is_empty() {
                        message.push_str(": ");
                        message.push_str(stderr.trim());
                    }
                    emit_update("error", "", Some(message));
                }
            }
        }
    });
    *AUDIO_SENDER.lock().unwrap() = Some(sender.clone());
    *SESSION.lock().await = Some(Session { id: session_id, sender, task });
    emit_update("listening", "", None);
    Ok(session_id)
}

async fn write_frame(
    writer: &mut tokio::process::ChildStdin,
    kind: u8,
    payload: &[u8],
) -> std::io::Result<()> {
    writer.write_u8(kind).await?;
    writer.write_u32_le(payload.len() as u32).await?;
    writer.write_all(payload).await?;
    writer.flush().await
}

fn handle_helper_output(line: &str) -> bool {
    match serde_json::from_str::<HelperOutput>(line) {
        Ok(HelperOutput::Draft { text, revision }) => {
            REVISION.fetch_max(revision, Ordering::Relaxed);
            emit_update("listening", text, None);
            false
        }
        Ok(HelperOutput::Cleared { revision }) => {
            REVISION.fetch_max(revision, Ordering::Relaxed);
            emit_update("listening", "", None);
            false
        }
        Ok(HelperOutput::Error { message }) => {
            emit_update("error", "", Some(message));
            true
        }
        Ok(HelperOutput::Ready) => false,
        Err(error) => {
            emit_update(
                "error",
                "",
                Some(format!("Invalid helper response: {error}")),
            );
            true
        }
    }
}

pub fn try_send_audio(samples: &[f32]) {
    let sender = AUDIO_SENDER.lock().unwrap().clone();
    let Some(sender) = sender else { return };
    match sender.try_send(Input::Audio(samples.to_vec())) {
        Ok(()) => {}
        Err(mpsc::error::TrySendError::Full(_)) => {
            if !OVERFLOWED.swap(true, Ordering::SeqCst) {
                emit_update("recovering", "", None);
            }
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {
            *AUDIO_SENDER.lock().unwrap() = None;
            emit_update(
                "error",
                "",
                Some("Sherpa helper stopped unexpectedly".into()),
            );
        }
    }
}

pub fn pause_session() {
    emit_update("paused", "", None);
}

pub fn resume_session() {
    if let Some(sender) = AUDIO_SENDER.lock().unwrap().clone() {
        let _ = sender.try_send(Input::Reset);
    }
    emit_update("listening", "", None);
}

async fn stop_session_inner(expected_id: Option<u64>) -> bool {
    let session = {
        let mut current = SESSION.lock().await;
        if current
            .as_ref()
            .is_some_and(|session| expected_id.map_or(true, |id| session.id == id))
        {
            current.take()
        } else {
            None
        }
    };
    if let Some(session) = session {
        *AUDIO_SENDER.lock().unwrap() = None;
        let _ = session.sender.send(Input::Shutdown).await;
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), session.task).await;
        true
    } else {
        false
    }
}

pub async fn stop_session_if(session_id: u64) {
    if stop_session_inner(Some(session_id)).await {
        emit_update("idle", "", None);
    }
}

pub async fn stop_session() {
    let _ = stop_session_inner(None).await;
    emit_update("idle", "", None);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_archive_traversal_components() {
        let unsafe_path = Path::new("model/../../escape");
        assert!(unsafe_path
            .components()
            .any(|part| matches!(part, Component::ParentDir)));
    }

    #[test]
    fn ready_requires_every_runtime_file() {
        let temp = tempfile::tempdir().unwrap();
        assert!(!model_ready_at(temp.path()));
        for name in REQUIRED_FILES {
            std::fs::write(temp.path().join(name), b"x").unwrap();
        }
        assert!(model_ready_at(temp.path()));
    }

    #[test]
    fn latest_update_survives_a_late_frontend_listener() {
        emit_update("error", "", Some("helper exited".into()));
        let update = get_live_preview_status();
        assert_eq!(update.state, "error");
        assert_eq!(update.error.as_deref(), Some("helper exited"));
    }
}
