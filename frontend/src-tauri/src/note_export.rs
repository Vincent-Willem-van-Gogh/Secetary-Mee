use crate::audio::recording_preferences::load_recording_preferences;
use crate::database::models::Transcript;
use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

const STORE_FILE: &str = "note-export-preferences.json";
const STORE_KEY: &str = "preferences";

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NoteExportFormat {
    #[default]
    Markdown,
    Text,
}

impl NoteExportFormat {
    fn extension(self) -> &'static str {
        match self {
            Self::Markdown => "md",
            Self::Text => "txt",
        }
    }

    fn parse(value: &str) -> Self {
        if value.eq_ignore_ascii_case("text") || value.eq_ignore_ascii_case("txt") {
            Self::Text
        } else {
            Self::Markdown
        }
    }

    fn storage_value(self) -> &'static str {
        match self {
            Self::Markdown => "markdown",
            Self::Text => "text",
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct StoredNoteExportPreferences {
    #[serde(default)]
    folder: Option<PathBuf>,
    #[serde(default)]
    format: NoteExportFormat,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteExportPreferences {
    pub folder: String,
    pub custom_folder: bool,
    pub format: NoteExportFormat,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteExportResult {
    pub path: String,
    pub format: NoteExportFormat,
    pub updated_existing: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct NoteMigrationResult {
    pub migrated: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteExportEvent {
    meeting_id: String,
    path: Option<String>,
    error: Option<String>,
}

fn load_stored_preferences<R: Runtime>(app: &AppHandle<R>) -> StoredNoteExportPreferences {
    let Ok(store) = app.store(STORE_FILE) else {
        return StoredNoteExportPreferences::default();
    };
    store
        .get(STORE_KEY)
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default()
}

fn save_stored_preferences<R: Runtime>(
    app: &AppHandle<R>,
    preferences: &StoredNoteExportPreferences,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to access note export preferences: {error}"))?;
    let value = serde_json::to_value(preferences)
        .map_err(|error| format!("Failed to serialize note export preferences: {error}"))?;
    store.set(STORE_KEY, value);
    store
        .save()
        .map_err(|error| format!("Failed to save note export preferences: {error}"))
}

async fn resolved_folder<R: Runtime>(
    app: &AppHandle<R>,
    preferences: &StoredNoteExportPreferences,
) -> Result<PathBuf, String> {
    if let Some(folder) = &preferences.folder {
        return Ok(folder.clone());
    }
    load_recording_preferences(app)
        .await
        .map(|preferences| preferences.save_folder)
        .map_err(|error| format!("Failed to load recording folder: {error}"))
}

#[tauri::command]
pub async fn get_note_export_preferences<R: Runtime>(
    app: AppHandle<R>,
) -> Result<NoteExportPreferences, String> {
    let stored = load_stored_preferences(&app);
    let folder = resolved_folder(&app, &stored).await?;
    Ok(NoteExportPreferences {
        folder: folder.to_string_lossy().into_owned(),
        custom_folder: stored.folder.is_some(),
        format: stored.format,
    })
}

#[tauri::command]
pub async fn choose_note_export_folder<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<NoteMigrationResult>, String> {
    let Some(folder) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let folder = PathBuf::from(folder.to_string());
    fs::create_dir_all(&folder)
        .map_err(|error| format!("Failed to create note export folder: {error}"))?;

    let mut preferences = load_stored_preferences(&app);
    preferences.folder = Some(folder.clone());
    save_stored_preferences(&app, &preferences)?;
    Ok(Some(
        migrate_exported_notes(&app, &folder, preferences.format).await?,
    ))
}

#[tauri::command]
pub async fn reset_note_export_folder<R: Runtime>(
    app: AppHandle<R>,
) -> Result<NoteMigrationResult, String> {
    let mut preferences = load_stored_preferences(&app);
    preferences.folder = None;
    let folder = resolved_folder(&app, &preferences).await?;
    save_stored_preferences(&app, &preferences)?;
    migrate_exported_notes(&app, &folder, preferences.format).await
}

#[tauri::command]
pub async fn set_note_export_format<R: Runtime>(
    app: AppHandle<R>,
    format: NoteExportFormat,
) -> Result<NoteMigrationResult, String> {
    let mut preferences = load_stored_preferences(&app);
    preferences.format = format;
    let folder = resolved_folder(&app, &preferences).await?;
    save_stored_preferences(&app, &preferences)?;
    migrate_exported_notes(&app, &folder, format).await
}

#[tauri::command]
pub async fn open_note_export_folder<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let preferences = load_stored_preferences(&app);
    let folder = resolved_folder(&app, &preferences).await?;
    fs::create_dir_all(&folder)
        .map_err(|error| format!("Failed to create note export folder: {error}"))?;
    open_folder(&folder)
}

#[tauri::command]
pub async fn export_meeting_note<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
) -> Result<NoteExportResult, String> {
    let preferences = load_stored_preferences(&app);
    let folder = resolved_folder(&app, &preferences).await?;
    let result = export_to(state.db_manager.pool(), &meeting_id, &folder, preferences.format).await?;
    let _ = app.emit(
        "meeting-note-export-updated",
        NoteExportEvent {
            meeting_id,
            path: Some(result.path.clone()),
            error: None,
        },
    );
    Ok(result)
}

pub async fn refresh_if_exported<R: Runtime>(
    app: &AppHandle<R>,
    pool: &SqlitePool,
    meeting_id: &str,
) {
    let existing = match export_metadata(pool, meeting_id).await {
        Ok(Some(existing)) => existing,
        Ok(None) => return,
        Err(error) => {
            emit_export_error(app, meeting_id, error);
            return;
        }
    };
    let Some(folder) = Path::new(&existing.0).parent() else {
        emit_export_error(app, meeting_id, "Saved note path has no parent folder".into());
        return;
    };
    match export_to(pool, meeting_id, folder, existing.1).await {
        Ok(result) => {
            let _ = app.emit(
                "meeting-note-export-updated",
                NoteExportEvent {
                    meeting_id: meeting_id.to_string(),
                    path: Some(result.path),
                    error: None,
                },
            );
        }
        Err(error) => emit_export_error(app, meeting_id, error),
    }
}

pub async fn migrate_following_recording_folder<R: Runtime>(app: &AppHandle<R>) {
    let preferences = load_stored_preferences(app);
    if preferences.folder.is_some() {
        return;
    }
    let Ok(folder) = resolved_folder(app, &preferences).await else {
        return;
    };
    if let Err(error) = migrate_exported_notes(app, &folder, preferences.format).await {
        log::warn!("Failed to migrate note exports with recording folder: {error}");
    }
}

fn emit_export_error<R: Runtime>(app: &AppHandle<R>, meeting_id: &str, error: String) {
    log::warn!("Failed to refresh exported note for {meeting_id}: {error}");
    let _ = app.emit(
        "meeting-note-export-error",
        NoteExportEvent {
            meeting_id: meeting_id.to_string(),
            path: None,
            error: Some(error),
        },
    );
}

async fn migrate_exported_notes<R: Runtime>(
    app: &AppHandle<R>,
    folder: &Path,
    format: NoteExportFormat,
) -> Result<NoteMigrationResult, String> {
    let state = app.state::<AppState>();
    let rows = sqlx::query_as::<_, (String,)>(
        "SELECT meeting_id FROM meeting_notes WHERE export_path IS NOT NULL",
    )
    .fetch_all(state.db_manager.pool())
    .await
    .map_err(|error| format!("Failed to list exported notes: {error}"))?;

    let mut result = NoteMigrationResult::default();
    for (meeting_id,) in rows {
        match export_to(state.db_manager.pool(), &meeting_id, folder, format).await {
            Ok(exported) => {
                result.migrated += 1;
                let _ = app.emit(
                    "meeting-note-export-updated",
                    NoteExportEvent {
                        meeting_id,
                        path: Some(exported.path),
                        error: None,
                    },
                );
            }
            Err(error) => {
                result.failed += 1;
                emit_export_error(app, &meeting_id, error);
            }
        }
    }
    Ok(result)
}

async fn export_metadata(
    pool: &SqlitePool,
    meeting_id: &str,
) -> Result<Option<(String, NoteExportFormat)>, String> {
    let row = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        "SELECT export_path, export_format FROM meeting_notes WHERE meeting_id = ?",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to read note export metadata: {error}"))?;
    Ok(row.and_then(|(path, format)| {
        path.map(|path| (path, NoteExportFormat::parse(format.as_deref().unwrap_or("markdown"))))
    }))
}

async fn export_to(
    pool: &SqlitePool,
    meeting_id: &str,
    folder: &Path,
    format: NoteExportFormat,
) -> Result<NoteExportResult, String> {
    if meeting_id.trim().is_empty() {
        return Err("Meeting ID cannot be empty".into());
    }
    let meeting = sqlx::query_as::<_, (String, String)>(
        "SELECT title, created_at FROM meetings WHERE id = ?",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to load meeting: {error}"))?
    .ok_or_else(|| "Meeting not found".to_string())?;
    let transcripts = sqlx::query_as::<_, Transcript>(
        "SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY CASE WHEN audio_start_time IS NULL THEN 1 ELSE 0 END, audio_start_time ASC, timestamp ASC, id ASC",
    )
    .bind(meeting_id)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to load transcripts: {error}"))?;
    if transcripts.is_empty() {
        return Err("No transcripts available to export".into());
    }

    let summary = sqlx::query_as::<_, (Option<String>,)>(
        "SELECT result FROM summary_processes WHERE meeting_id = ?",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to load summary: {error}"))?
    .and_then(|row| row.0)
    .and_then(|raw| extract_summary_markdown(&raw));

    fs::create_dir_all(folder)
        .map_err(|error| format!("Failed to create note export folder: {error}"))?;
    let existing = export_metadata(pool, meeting_id).await?;
    let old_path = existing.as_ref().map(|(path, _)| PathBuf::from(path));
    let title = sanitize_filename(&meeting.0);
    let target = unique_target(folder, &title, format.extension(), old_path.as_deref());
    let content = render_note(
        format,
        &meeting.0,
        &meeting.1,
        meeting_id,
        &transcripts,
        summary.as_deref(),
    );
    atomic_write(&target, content.as_bytes())?;

    let now = Utc::now();
    let target_string = target.to_string_lossy().into_owned();
    if let Err(error) = sqlx::query(
        "INSERT INTO meeting_notes (meeting_id, notes_markdown, notes_json, created_at, updated_at, export_path, export_format) VALUES (?, NULL, NULL, ?, ?, ?, ?) ON CONFLICT(meeting_id) DO UPDATE SET updated_at = excluded.updated_at, export_path = excluded.export_path, export_format = excluded.export_format",
    )
    .bind(meeting_id)
    .bind(now)
    .bind(now)
    .bind(&target_string)
    .bind(format.storage_value())
    .execute(pool)
    .await
    {
        if old_path.as_deref() != Some(target.as_path()) {
            let _ = fs::remove_file(&target);
        }
        return Err(format!("Failed to save note export metadata: {error}"));
    }

    if let Some(old_path) = old_path.as_ref().filter(|path| path.as_path() != target) {
        if old_path.exists() {
            if let Err(error) = fs::remove_file(old_path) {
                log::warn!("Export moved but old note could not be removed: {error}");
            }
        }
    }

    Ok(NoteExportResult {
        path: target_string,
        format,
        updated_existing: existing.is_some(),
    })
}

fn render_note(
    format: NoteExportFormat,
    title: &str,
    date: &str,
    meeting_id: &str,
    transcripts: &[Transcript],
    summary: Option<&str>,
) -> String {
    let mut output = match format {
        NoteExportFormat::Markdown => format!(
            "# {title}\n\n- Date / 日期：{date}\n- Meeting ID / 会议 ID：{meeting_id}\n\n## Transcript / 会议转写\n\n"
        ),
        NoteExportFormat::Text => format!(
            "{title}\n\nDate / 日期：{date}\nMeeting ID / 会议 ID：{meeting_id}\n\nTranscript / 会议转写\n\n"
        ),
    };

    for transcript in transcripts {
        let timestamp = display_timestamp(transcript.audio_start_time, &transcript.timestamp);
        match format {
            NoteExportFormat::Markdown => {
                output.push_str(&format!("### {timestamp}\n\n**Original / 原文**\n\n{}\n\n", transcript.transcript.trim()));
                if let Some(translation) = transcript.translation_zh_cn.as_deref().map(str::trim).filter(|text| !text.is_empty()) {
                    output.push_str(&format!("**Simplified Chinese / 简体中文**\n\n{translation}\n\n"));
                }
            }
            NoteExportFormat::Text => {
                output.push_str(&format!("{timestamp}\nOriginal / 原文：{}\n", transcript.transcript.trim()));
                if let Some(translation) = transcript.translation_zh_cn.as_deref().map(str::trim).filter(|text| !text.is_empty()) {
                    output.push_str(&format!("Simplified Chinese / 简体中文：{translation}\n"));
                }
                output.push('\n');
            }
        }
    }

    if let Some(summary) = summary.map(str::trim).filter(|summary| !summary.is_empty()) {
        match format {
            NoteExportFormat::Markdown => {
                output.push_str("## Summary / 摘要\n\n");
                output.push_str(summary);
                output.push('\n');
            }
            NoteExportFormat::Text => {
                output.push_str("Summary / 摘要\n\n");
                output.push_str(&markdown_to_text(summary));
                output.push('\n');
            }
        }
    }
    output
}

fn extract_summary_markdown(raw: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    if let Some(markdown) = value.get("markdown").and_then(|value| value.as_str()) {
        if !markdown.trim().is_empty() {
            return Some(markdown.trim().to_string());
        }
    }
    if let Some(sections) = value
        .pointer("/MeetingNotes/sections")
        .and_then(|value| value.as_array())
    {
        let rendered = render_legacy_sections(sections.iter());
        return (!rendered.is_empty()).then_some(rendered);
    }
    if let Some(blocks) = value.get("summary_json").and_then(|value| value.as_array()) {
        let rendered = blocks
            .iter()
            .filter_map(block_text)
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");
        return (!rendered.is_empty()).then_some(rendered);
    }
    let order = value.get("_section_order").and_then(|value| value.as_array());
    let sections: Vec<&serde_json::Value> = if let Some(order) = order {
        order
            .iter()
            .filter_map(|key| key.as_str().and_then(|key| value.get(key)))
            .collect()
    } else {
        value
            .as_object()?
            .iter()
            .filter(|(key, _)| !matches!(key.as_str(), "MeetingName" | "_section_order"))
            .map(|(_, section)| section)
            .collect()
    };
    let rendered = render_legacy_sections(sections.into_iter());
    (!rendered.is_empty()).then_some(rendered)
}

fn render_legacy_sections<'a>(sections: impl Iterator<Item = &'a serde_json::Value>) -> String {
    sections
        .filter_map(|section| {
            let title = section.get("title")?.as_str()?.trim();
            let blocks = section.get("blocks")?.as_array()?;
            let content = blocks
                .iter()
                .filter_map(block_text)
                .filter(|text| !text.is_empty())
                .map(|text| format!("- {text}"))
                .collect::<Vec<_>>()
                .join("\n");
            (!content.is_empty()).then(|| format!("### {title}\n\n{content}"))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn block_text(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => Some(text.trim().to_string()),
        serde_json::Value::Array(values) => Some(
            values
                .iter()
                .filter_map(block_text)
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join(" "),
        ),
        serde_json::Value::Object(object) => object
            .get("text")
            .and_then(block_text)
            .or_else(|| object.get("content").and_then(block_text))
            .or_else(|| object.get("children").and_then(block_text)),
        _ => None,
    }
}

fn display_timestamp(audio_start_time: Option<f64>, fallback: &str) -> String {
    let Some(seconds) = audio_start_time.filter(|seconds| seconds.is_finite() && *seconds >= 0.0) else {
        return if fallback.starts_with('[') { fallback.to_string() } else { format!("[{fallback}]") };
    };
    let seconds = seconds.floor() as u64;
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let seconds = seconds % 60;
    if hours > 0 {
        format!("[{hours:02}:{minutes:02}:{seconds:02}]")
    } else {
        format!("[{minutes:02}:{seconds:02}]")
    }
}

fn sanitize_filename(title: &str) -> String {
    let mut name: String = title
        .trim()
        .chars()
        .map(|character| {
            if character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                character
            }
        })
        .take(120)
        .collect();
    name = name.trim_matches(|character| character == ' ' || character == '.').to_string();
    if name.is_empty() {
        name = "Meeting".into();
    }
    let upper = name.to_ascii_uppercase();
    if matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.as_bytes()[3].is_ascii_digit())
    {
        name.push('_');
    }
    name
}

fn unique_target(folder: &Path, title: &str, extension: &str, owned: Option<&Path>) -> PathBuf {
    let first = folder.join(format!("{title}.{extension}"));
    if Some(first.as_path()) == owned || !first.exists() {
        return first;
    }
    for index in 2.. {
        let candidate = folder.join(format!("{title} ({index}).{extension}"));
        if Some(candidate.as_path()) == owned || !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Note path has no parent folder".to_string())?;
    let temp = parent.join(format!(".secretary-mee-{}.tmp", Uuid::new_v4()));
    let mut file = File::create(&temp).map_err(|error| format!("Failed to create temporary note: {error}"))?;
    file.write_all(content).map_err(|error| format!("Failed to write note: {error}"))?;
    file.sync_all().map_err(|error| format!("Failed to flush note: {error}"))?;

    if !path.exists() {
        return fs::rename(&temp, path).map_err(|error| {
            let _ = fs::remove_file(&temp);
            format!("Failed to finalize note: {error}")
        });
    }

    let backup = parent.join(format!(".secretary-mee-{}.backup", Uuid::new_v4()));
    fs::rename(path, &backup).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("Failed to preserve existing note: {error}")
    })?;
    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::rename(&backup, path);
        let _ = fs::remove_file(&temp);
        return Err(format!("Failed to replace note: {error}"));
    }
    let _ = fs::remove_file(backup);
    Ok(())
}

fn markdown_to_text(markdown: &str) -> String {
    markdown
        .lines()
        .map(|line| {
            let line = line.trim_start_matches('#').trim_start();
            line.replace("**", "").replace("__", "").replace('`', "")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn open_folder(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open note export folder: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_bilingual_note_and_omits_missing_sections() {
        let transcripts = vec![Transcript {
            id: "1".into(),
            meeting_id: "meeting-1".into(),
            transcript: "Hello".into(),
            timestamp: "12:00:00".into(),
            summary: None,
            action_items: None,
            key_points: None,
            audio_start_time: Some(4.2),
            audio_end_time: Some(5.0),
            duration: Some(0.8),
            translation_zh_cn: Some("你好".into()),
            translation_provider: None,
            translation_model: None,
        }];
        let note = render_note(NoteExportFormat::Markdown, "Test", "2026-08-02", "meeting-1", &transcripts, None);
        assert!(note.contains("### [00:04]"));
        assert!(note.contains("Hello"));
        assert!(note.contains("你好"));
        assert!(!note.contains("## Summary / 摘要"));
    }

    #[test]
    fn sanitizes_cross_platform_filenames() {
        assert_eq!(sanitize_filename(" A/B:C*? "), "A_B_C__");
        assert_eq!(sanitize_filename("CON"), "CON_");
        assert_eq!(sanitize_filename("..."), "Meeting");
    }

    #[tokio::test]
    async fn later_summary_overwrites_the_existing_conversation_export() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL)")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE transcripts (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, transcript TEXT NOT NULL, timestamp TEXT NOT NULL, summary TEXT, action_items TEXT, key_points TEXT, audio_start_time REAL, audio_end_time REAL, duration REAL, translation_zh_cn TEXT, translation_provider TEXT, translation_model TEXT)")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE summary_processes (meeting_id TEXT PRIMARY KEY, result TEXT)")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE meeting_notes (meeting_id TEXT PRIMARY KEY, notes_markdown TEXT, notes_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, export_path TEXT, export_format TEXT)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO meetings VALUES ('meeting-1', 'Test Meeting', '2026-08-02')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO transcripts VALUES ('segment-1', 'meeting-1', 'Hello', '12:00:00', NULL, NULL, NULL, 4.0, 5.0, 1.0, '你好', NULL, NULL)")
            .execute(&pool).await.unwrap();

        let folder = std::env::temp_dir().join(format!("secretary-mee-note-test-{}", Uuid::new_v4()));
        let first = export_to(&pool, "meeting-1", &folder, NoteExportFormat::Markdown).await.unwrap();
        let first_content = fs::read_to_string(&first.path).unwrap();
        assert!(!first_content.contains("## Summary / 摘要"));

        sqlx::query("INSERT INTO summary_processes VALUES ('meeting-1', '{\"markdown\":\"Action items\"}')")
            .execute(&pool).await.unwrap();
        let second = export_to(&pool, "meeting-1", &folder, NoteExportFormat::Markdown).await.unwrap();
        assert_eq!(first.path, second.path);
        let second_content = fs::read_to_string(&second.path).unwrap();
        assert!(second_content.contains("## Summary / 摘要\n\nAction items"));
        let _ = fs::remove_dir_all(folder);
    }
}
