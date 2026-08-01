use std::sync::RwLock;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "ui-preferences.json";
const LANGUAGE_STORE_KEY: &str = "ui_language";
const THEME_STORE_KEY: &str = "ui_theme";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum UiLanguage {
    #[default]
    English,
    SimplifiedChinese,
}

impl UiLanguage {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "en" => Ok(Self::English),
            "zh-CN" => Ok(Self::SimplifiedChinese),
            _ => Err(format!("Unsupported interface language: {value}")),
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::English => "en",
            Self::SimplifiedChinese => "zh-CN",
        }
    }

    pub fn text<'a>(self, key: &'a str) -> &'a str {
        if self == Self::English {
            return match key {
                "tray.downloading" => "⏳ Downloading transcription model...",
                "tray.start" => "Start Recording",
                "tray.starting" => "🔄 Starting Recording...",
                "tray.pause" => "⏸ Pause Recording",
                "tray.stop" => "⏹ Stop Recording",
                "tray.pausing" => "⏸ Pausing...",
                "tray.resume" => "▶ Resume Recording",
                "tray.resuming" => "▶ Resuming...",
                "tray.stopping" => "⏹ Stopping...",
                "tray.open" => "Open Main Window",
                "tray.settings" => "Settings",
                "tray.quit" => "Quit",
                "notification.recording_started" => "Recording started for meeting: {name}",
                "notification.recording_started_generic" => "Recording has started. Please inform others in the meeting that you are recording.",
                "notification.recording_stopped" => "Recording has been stopped and saved",
                "notification.recording_paused" => "Recording has been paused",
                "notification.recording_resumed" => "Recording has been resumed",
                "notification.transcription_complete" => "Transcription completed and saved to: {path}",
                "notification.transcription_complete_generic" => "Transcription has been completed",
                "notification.meeting_reminder" => "Meeting '{title}' starts in {minutes} minutes",
                "notification.meeting_reminder_generic" => "Meeting starts in {minutes} minutes",
                "notification.error_title" => "Secretary Mee Error",
                "notification.test" => "This is a test notification to verify the system is working correctly",
                _ => key,
            };
        }

        match key {
            "tray.downloading" => "⏳ 正在下载转写模型…",
            "tray.start" => "开始录音",
            "tray.starting" => "🔄 正在开始录音…",
            "tray.pause" => "⏸ 暂停录音",
            "tray.stop" => "⏹ 停止录音",
            "tray.pausing" => "⏸ 正在暂停…",
            "tray.resume" => "▶ 继续录音",
            "tray.resuming" => "▶ 正在继续…",
            "tray.stopping" => "⏹ 正在停止…",
            "tray.open" => "打开主窗口",
            "tray.settings" => "设置",
            "tray.quit" => "退出",
            "notification.recording_started" => "会议“{name}”已开始录音",
            "notification.recording_started_generic" => "录音已开始，请告知会议中的其他参与者。",
            "notification.recording_stopped" => "录音已停止并保存",
            "notification.recording_paused" => "录音已暂停",
            "notification.recording_resumed" => "录音已继续",
            "notification.transcription_complete" => "转写已完成并保存至：{path}",
            "notification.transcription_complete_generic" => "转写已完成",
            "notification.meeting_reminder" => "会议“{title}”将在 {minutes} 分钟后开始",
            "notification.meeting_reminder_generic" => "会议将在 {minutes} 分钟后开始",
            "notification.error_title" => "Secretary Mee 错误",
            "notification.test" => "这是一条测试通知，用于确认通知功能正常。",
            _ => key,
        }
    }
}

#[derive(Default)]
pub struct UiLanguageState(RwLock<UiLanguage>);

impl UiLanguageState {
    pub fn get(&self) -> UiLanguage {
        self.0.read().map(|value| *value).unwrap_or_default()
    }

    fn set(&self, language: UiLanguage) {
        if let Ok(mut value) = self.0.write() {
            *value = language;
        }
    }
}

pub fn initialize<R: Runtime>(app: &AppHandle<R>) {
    let language = app
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(LANGUAGE_STORE_KEY))
        .and_then(|value| value.as_str().map(str::to_owned))
        .and_then(|value| UiLanguage::parse(&value).ok())
        .unwrap_or_default();

    app.state::<UiLanguageState>().set(language);
}

#[tauri::command]
pub fn get_ui_language(state: State<'_, UiLanguageState>) -> String {
    state.get().code().to_owned()
}

#[tauri::command]
pub fn set_ui_language<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, UiLanguageState>,
    language: String,
) -> Result<(), String> {
    let language = UiLanguage::parse(&language)?;
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open interface language store: {error}"))?;

    store.set(LANGUAGE_STORE_KEY, serde_json::json!(language.code()));
    store
        .save()
        .map_err(|error| format!("Failed to save interface language: {error}"))?;

    state.set(language);
    crate::tray::update_tray_menu(&app);
    Ok(())
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum UiTheme {
    Light,
    Dark,
    #[default]
    System,
}

impl UiTheme {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "light" => Ok(Self::Light),
            "dark" => Ok(Self::Dark),
            "system" => Ok(Self::System),
            _ => Err(format!("Unsupported interface theme: {value}")),
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
            Self::System => "system",
        }
    }
}

#[tauri::command]
pub fn get_ui_theme<R: Runtime>(app: AppHandle<R>) -> String {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(THEME_STORE_KEY))
        .and_then(|value| value.as_str().map(str::to_owned))
        .and_then(|value| UiTheme::parse(&value).ok())
        .unwrap_or_default()
        .code()
        .to_owned()
}

#[tauri::command]
pub fn set_ui_theme<R: Runtime>(app: AppHandle<R>, theme: String) -> Result<(), String> {
    let theme = UiTheme::parse(&theme)?;
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open interface theme store: {error}"))?;

    store.set(THEME_STORE_KEY, serde_json::json!(theme.code()));
    store
        .save()
        .map_err(|error| format!("Failed to save interface theme: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_languages() {
        assert_eq!(UiLanguage::parse("en").unwrap(), UiLanguage::English);
        assert_eq!(
            UiLanguage::parse("zh-CN").unwrap(),
            UiLanguage::SimplifiedChinese
        );
        assert!(UiLanguage::parse("fr").is_err());
    }

    #[test]
    fn translates_native_text() {
        assert_eq!(UiLanguage::SimplifiedChinese.text("tray.start"), "开始录音");
        assert_eq!(
            UiLanguage::English.text("notification.recording_stopped"),
            "Recording has been stopped and saved"
        );
    }

    #[test]
    fn translates_every_tray_state_and_defaults_to_english() {
        assert_eq!(UiLanguage::default(), UiLanguage::English);

        for key in [
            "tray.downloading",
            "tray.start",
            "tray.starting",
            "tray.pause",
            "tray.stop",
            "tray.pausing",
            "tray.resume",
            "tray.resuming",
            "tray.stopping",
            "tray.open",
            "tray.settings",
            "tray.quit",
        ] {
            let english = UiLanguage::English.text(key);
            let chinese = UiLanguage::SimplifiedChinese.text(key);
            assert_ne!(english, key);
            assert_ne!(chinese, key);
            assert_ne!(english, chinese);
        }
    }

    #[test]
    fn validates_supported_themes_and_defaults_to_system() {
        assert_eq!(UiTheme::parse("light").unwrap(), UiTheme::Light);
        assert_eq!(UiTheme::parse("dark").unwrap(), UiTheme::Dark);
        assert_eq!(UiTheme::parse("system").unwrap(), UiTheme::System);
        assert_eq!(UiTheme::default(), UiTheme::System);
        assert!(UiTheme::parse("midnight").is_err());
    }
}
