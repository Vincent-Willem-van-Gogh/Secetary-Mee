use crate::{database::repositories::setting::SettingsRepository, state::AppState};
use reqwest::StatusCode;
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CloudProvider {
    OpenAi,
    Claude,
    Groq,
    OpenRouter,
}

impl CloudProvider {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "openai" => Ok(Self::OpenAi),
            "claude" => Ok(Self::Claude),
            "groq" => Ok(Self::Groq),
            "openrouter" => Ok(Self::OpenRouter),
            _ => Err("Unsupported cloud provider".to_string()),
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Claude => "claude",
            Self::Groq => "groq",
            Self::OpenRouter => "openrouter",
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct CredentialStatus {
    provider: &'static str,
    has_api_key: bool,
}

fn validate_key_input(key: &str) -> Result<&str, String> {
    let key = key.trim();
    if key.is_empty() || key.chars().count() > 10_000 {
        return Err("API key must contain between 1 and 10000 characters".to_string());
    }
    Ok(key)
}

async fn verify(provider: CloudProvider, key: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Could not create credential verification request".to_string())?;

    let request = match provider {
        CloudProvider::OpenAi => client
            .get("https://api.openai.com/v1/models")
            .bearer_auth(key),
        CloudProvider::Claude => client
            .get("https://api.anthropic.com/v1/models")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01"),
        CloudProvider::Groq => client
            .get("https://api.groq.com/openai/v1/models")
            .bearer_auth(key),
        CloudProvider::OpenRouter => client
            .get("https://openrouter.ai/api/v1/key")
            .bearer_auth(key),
    };

    let response = request
        .send()
        .await
        .map_err(|error| if error.is_timeout() {
            "Credential verification timed out"
        } else {
            "Could not reach the provider"
        }.to_string())?;

    match response.status() {
        status if status.is_success() => Ok(()),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            Err("The provider rejected this API key".to_string())
        }
        StatusCode::TOO_MANY_REQUESTS => Err("The provider rate limit was reached".to_string()),
        status => Err(format!("Provider verification failed with HTTP {}", status.as_u16())),
    }
}

fn clear_provider_cache(provider: CloudProvider) {
    match provider {
        CloudProvider::OpenAi => crate::openai::openai::clear_cache(),
        CloudProvider::Claude => crate::anthropic::anthropic::clear_cache(),
        CloudProvider::Groq => crate::groq::groq::clear_cache(),
        CloudProvider::OpenRouter => {}
    }
}

fn emit_update<R: Runtime>(app: &AppHandle<R>, provider: CloudProvider, has_api_key: bool) {
    let _ = app.emit(
        "cloud-credentials-updated",
        CredentialStatus { provider: provider.id(), has_api_key },
    );
}

#[tauri::command]
pub async fn get_cloud_credential_statuses(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<CredentialStatus>, String> {
    let pool = state.db_manager.pool();
    let mut statuses = Vec::with_capacity(4);
    for provider in [CloudProvider::OpenAi, CloudProvider::Claude, CloudProvider::Groq, CloudProvider::OpenRouter] {
        let has_api_key = SettingsRepository::get_api_key(pool, provider.id())
            .await
            .map_err(|e| e.to_string())?
            .is_some_and(|key| !key.trim().is_empty());
        statuses.push(CredentialStatus { provider: provider.id(), has_api_key });
    }
    Ok(statuses)
}

#[tauri::command]
pub async fn test_cloud_credential(
    state: tauri::State<'_, AppState>,
    provider: String,
    api_key: Option<String>,
) -> Result<(), String> {
    let provider = CloudProvider::parse(&provider)?;
    let supplied = api_key.as_deref().map(validate_key_input).transpose()?;
    let saved;
    let key = if let Some(key) = supplied {
        key
    } else {
        saved = SettingsRepository::get_api_key(state.db_manager.pool(), provider.id())
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "No saved API key".to_string())?;
        validate_key_input(&saved)?
    };
    verify(provider, key).await
}

#[tauri::command]
pub async fn save_cloud_credential<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    let provider = CloudProvider::parse(&provider)?;
    let key = validate_key_input(&api_key)?;
    verify(provider, key).await?;
    SettingsRepository::save_api_key(state.db_manager.pool(), provider.id(), key)
        .await
        .map_err(|e| e.to_string())?;
    clear_provider_cache(provider);
    emit_update(&app, provider, true);
    Ok(())
}

#[tauri::command]
pub async fn delete_cloud_credential<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    provider: String,
) -> Result<(), String> {
    let provider = CloudProvider::parse(&provider)?;
    SettingsRepository::delete_api_key(state.db_manager.pool(), provider.id())
        .await
        .map_err(|e| e.to_string())?;
    clear_provider_cache(provider);
    emit_update(&app, provider, false);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_and_key_validation_reject_untrusted_values() {
        assert_eq!(CloudProvider::parse("groq").unwrap(), CloudProvider::Groq);
        assert!(CloudProvider::parse("unknown").is_err());
        assert!(validate_key_input(" ").is_err());
        assert!(validate_key_input(&"x".repeat(10_001)).is_err());
    }

    #[tokio::test]
    async fn groq_migration_prefers_summary_key_and_clears_legacy_copy() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(
            "CREATE TABLE settings (id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, whisperModel TEXT NOT NULL, groqApiKey TEXT);\
             CREATE TABLE transcript_settings (id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, groqApiKey TEXT);\
             INSERT INTO settings VALUES ('1','groq','model','large-v3','summary-key');\
             INSERT INTO transcript_settings VALUES ('1','parakeet','model','translation-key');",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!("../migrations/20260801010000_unify_groq_credentials.sql"))
            .execute(&pool)
            .await
            .unwrap();
        let row: (Option<String>, Option<String>) = sqlx::query_as(
            "SELECT s.groqApiKey, t.groqApiKey FROM settings s JOIN transcript_settings t ON t.id=s.id",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0.as_deref(), Some("summary-key"));
        assert_eq!(row.1, None);
    }

    #[tokio::test]
    async fn groq_migration_copies_translation_key_when_summary_key_is_empty() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(
            "CREATE TABLE settings (id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, whisperModel TEXT NOT NULL, groqApiKey TEXT);\
             CREATE TABLE transcript_settings (id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, groqApiKey TEXT);\
             INSERT INTO settings VALUES ('1','builtin-ai','model','large-v3',NULL);\
             INSERT INTO transcript_settings VALUES ('1','parakeet','model','translation-key');",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!("../migrations/20260801010000_unify_groq_credentials.sql"))
            .execute(&pool)
            .await
            .unwrap();
        let row: (Option<String>, Option<String>) = sqlx::query_as(
            "SELECT s.groqApiKey, t.groqApiKey FROM settings s JOIN transcript_settings t ON t.id=s.id",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0.as_deref(), Some("translation-key"));
        assert_eq!(row.1, None);
    }
}
