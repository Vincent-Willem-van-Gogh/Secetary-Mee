use once_cell::sync::Lazy;
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

static DIAGNOSTICS_PATH: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

pub fn start(meeting_folder: Option<PathBuf>) {
    let path = meeting_folder.map(|folder| folder.join("transcription-diagnostics.jsonl"));
    if let Some(path) = path.as_ref() {
        let _ = std::fs::write(path, "");
    }
    *DIAGNOSTICS_PATH.lock().unwrap() = path;
    record("recording_started", serde_json::json!({}));
}

pub fn record(event: &str, details: Value) {
    let path = DIAGNOSTICS_PATH.lock().unwrap().clone();
    let Some(path) = path else { return };
    let line = serde_json::json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "event": event,
        "details": details,
    });
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{}", line);
    }
}

pub fn finish(chunks_in_queue: usize, last_activity_ms: u64) {
    record("recording_finished", serde_json::json!({
        "chunks_in_queue": chunks_in_queue,
        "last_activity_ms": last_activity_ms,
    }));
    *DIAGNOSTICS_PATH.lock().unwrap() = None;
}
