use serde::{Deserialize, Serialize};
use crate::ui_language::UiLanguage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: Option<String>,
    pub title: String,
    pub body: String,
    pub notification_type: NotificationType,
    pub priority: NotificationPriority,
    pub timeout: NotificationTimeout,
    pub icon: Option<String>,
    pub sound: bool,
    pub actions: Vec<NotificationAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationType {
    RecordingStarted,
    RecordingStopped,
    RecordingPaused,
    RecordingResumed,
    TranscriptionComplete,
    MeetingReminder(u64), // Duration in minutes
    SystemError(String),
    Test, // For testing notifications
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationPriority {
    Low,
    Normal,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationTimeout {
    Never,
    Seconds(u64),
    Default,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationAction {
    pub id: String,
    pub title: String,
    pub action_type: NotificationActionType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationActionType {
    Button,
    Reply,
}

impl Notification {
    pub fn new(title: impl Into<String>, body: impl Into<String>, notification_type: NotificationType) -> Self {
        Self {
            id: None,
            title: title.into(),
            body: body.into(),
            notification_type,
            priority: NotificationPriority::Normal,
            timeout: NotificationTimeout::Default,
            icon: None,
            sound: true,
            actions: vec![],
        }
    }

    pub fn with_priority(mut self, priority: NotificationPriority) -> Self {
        self.priority = priority;
        self
    }

    pub fn with_timeout(mut self, timeout: NotificationTimeout) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_sound(mut self, sound: bool) -> Self {
        self.sound = sound;
        self
    }

    pub fn with_icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = Some(icon.into());
        self
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn add_action(mut self, action: NotificationAction) -> Self {
        self.actions.push(action);
        self
    }
}

impl Default for NotificationPriority {
    fn default() -> Self {
        NotificationPriority::Normal
    }
}

impl Default for NotificationTimeout {
    fn default() -> Self {
        NotificationTimeout::Default
    }
}

// Helper functions for creating common notifications
impl Notification {
    pub fn recording_started(language: UiLanguage, meeting_name: Option<String>) -> Self {
        let body = match meeting_name {
            Some(name) => language
                .text("notification.recording_started")
                .replace("{name}", &name),
            None => language.text("notification.recording_started_generic").to_string(),
        };

        Notification::new("Secretary Mee", body, NotificationType::RecordingStarted)
            .with_priority(NotificationPriority::High)
            .with_timeout(NotificationTimeout::Seconds(5))
    }

    pub fn recording_stopped(language: UiLanguage) -> Self {
        Notification::new(
            "Secretary Mee",
            language.text("notification.recording_stopped"),
            NotificationType::RecordingStopped
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(3))
    }

    pub fn recording_paused(language: UiLanguage) -> Self {
        Notification::new(
            "Secretary Mee",
            language.text("notification.recording_paused"),
            NotificationType::RecordingPaused
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(3))
    }

    pub fn recording_resumed(language: UiLanguage) -> Self {
        Notification::new(
            "Secretary Mee",
            language.text("notification.recording_resumed"),
            NotificationType::RecordingResumed
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(3))
    }

    pub fn transcription_complete(language: UiLanguage, file_path: Option<String>) -> Self {
        let body = match file_path {
            Some(path) => language
                .text("notification.transcription_complete")
                .replace("{path}", &path),
            None => language.text("notification.transcription_complete_generic").to_string(),
        };

        Notification::new("Secretary Mee", body, NotificationType::TranscriptionComplete)
            .with_priority(NotificationPriority::Normal)
            .with_timeout(NotificationTimeout::Seconds(5))
    }

    pub fn meeting_reminder(
        language: UiLanguage,
        minutes_until: u64,
        meeting_title: Option<String>,
    ) -> Self {
        let body = match meeting_title {
            Some(title) => language
                .text("notification.meeting_reminder")
                .replace("{title}", &title)
                .replace("{minutes}", &minutes_until.to_string()),
            None => language
                .text("notification.meeting_reminder_generic")
                .replace("{minutes}", &minutes_until.to_string()),
        };

        Notification::new("Secretary Mee", body, NotificationType::MeetingReminder(minutes_until))
            .with_priority(NotificationPriority::High)
            .with_timeout(NotificationTimeout::Seconds(10))
    }

    pub fn system_error(language: UiLanguage, error: impl Into<String>) -> Self {
        let error_string = error.into();
        Notification::new(
            language.text("notification.error_title"),
            error_string.clone(),
            NotificationType::SystemError(error_string)
        )
        .with_priority(NotificationPriority::Critical)
        .with_timeout(NotificationTimeout::Never)
    }

    pub fn test_notification(language: UiLanguage) -> Self {
        Notification::new(
            "Secretary Mee",
            language.text("notification.test"),
            NotificationType::Test
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(5))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn localizes_dynamic_notification_text_without_changing_user_data() {
        let notification = Notification::recording_started(
            UiLanguage::SimplifiedChinese,
            Some("Weekly Sync".to_string()),
        );
        assert_eq!(notification.body, "会议“Weekly Sync”已开始录音");

        let error = Notification::system_error(
            UiLanguage::SimplifiedChinese,
            "backend detail",
        );
        assert_eq!(error.title, "Secretary Mee 错误");
        assert_eq!(error.body, "backend detail");
    }
}
