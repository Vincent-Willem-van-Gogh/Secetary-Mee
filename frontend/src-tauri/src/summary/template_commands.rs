use crate::summary::templates;
use serde::{Deserialize, Serialize};
use tauri::Runtime;
use tracing::{info, warn};
use uuid::Uuid;

use super::templates::TemplateSection;

/// Template metadata for UI display
#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateInfo {
    /// Template identifier (e.g., "daily_standup", "standard_meeting")
    pub id: String,

    /// Display name for the template
    pub name: String,

    /// Brief description of the template's purpose
    pub description: String,

    pub source: String,
}

/// Detailed template structure for preview/debugging
#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateDetails {
    /// Template identifier
    pub id: String,

    /// Display name
    pub name: String,

    /// Description
    pub description: String,

    /// List of section titles in order
    pub sections: Vec<TemplateSection>,

    pub source: String,
}

/// Lists all available templates
///
/// Returns templates from both built-in (embedded) and custom (user data directory) sources.
/// Templates are automatically discovered - no code changes needed to add new templates.
///
/// # Returns
/// Vector of TemplateInfo with id, name, and description for each template
#[tauri::command]
pub async fn api_list_templates<R: Runtime>(
    _app: tauri::AppHandle<R>,
) -> Result<Vec<TemplateInfo>, String> {
    info!("api_list_templates called");

    let templates = templates::list_templates();

    let template_infos: Vec<TemplateInfo> = templates
        .into_iter()
        .map(|(id, name, description)| TemplateInfo {
            source: if templates::is_custom_template(&id) { "custom" } else { "built_in" }.to_string(),
            id,
            name,
            description,
        })
        .collect();

    info!("Found {} available templates", template_infos.len());

    Ok(template_infos)
}

/// Gets detailed information about a specific template
///
/// # Arguments
/// * `template_id` - Template identifier (e.g., "daily_standup")
///
/// # Returns
/// TemplateDetails with full template structure
#[tauri::command]
pub async fn api_get_template_details<R: Runtime>(
    _app: tauri::AppHandle<R>,
    template_id: String,
) -> Result<TemplateDetails, String> {
    info!("api_get_template_details called for template_id: {}", template_id);

    let template = templates::get_template(&template_id)?;

    let details = TemplateDetails {
        source: if templates::is_custom_template(&template_id) { "custom" } else { "built_in" }.to_string(),
        id: template_id,
        name: template.name,
        description: template.description,
        sections: template.sections,
    };

    info!("Retrieved template details for '{}'", details.name);

    Ok(details)
}

fn save_template_to_dir(
    directory: &std::path::Path,
    template_id: Option<String>,
    template_json: &str,
) -> Result<TemplateInfo, String> {
    if template_json.len() > 128 * 1024 {
        return Err("Template is too large".to_string());
    }
    let template = templates::validate_and_parse_template(template_json)?;
    let id = template_id.unwrap_or_else(|| format!("custom_{}", Uuid::new_v4().simple()));
    if !id.starts_with("custom_") || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Invalid custom template identifier".to_string());
    }

    std::fs::create_dir_all(directory).map_err(|e| format!("Could not create templates folder: {}", e))?;
    let target = directory.join(format!("{}.json", id));
    let temporary = directory.join(format!(".{}.tmp", id));
    std::fs::write(&temporary, template_json).map_err(|e| format!("Could not save template: {}", e))?;
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| format!("Could not replace template: {}", e))?;
    }
    std::fs::rename(&temporary, &target).map_err(|e| format!("Could not finish saving template: {}", e))?;

    Ok(TemplateInfo {
        id,
        name: template.name,
        description: template.description,
        source: "custom".to_string(),
    })
}

#[tauri::command]
pub async fn api_save_custom_template(
    template_id: Option<String>,
    template_json: String,
) -> Result<TemplateInfo, String> {
    let directory = templates::get_custom_templates_dir()
        .ok_or_else(|| "Could not resolve templates folder".to_string())?;
    save_template_to_dir(&directory, template_id, &template_json)
}

#[tauri::command]
pub async fn api_delete_custom_template(template_id: String) -> Result<(), String> {
    if !template_id.starts_with("custom_") || !template_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Only custom templates can be deleted".to_string());
    }
    let directory = templates::get_custom_templates_dir()
        .ok_or_else(|| "Could not resolve templates folder".to_string())?;
    let target = directory.join(format!("{}.json", template_id));
    if !target.is_file() {
        return Err("Custom template not found".to_string());
    }
    std::fs::remove_file(target).map_err(|e| format!("Could not delete template: {}", e))
}

/// Validates a custom template JSON string
///
/// Useful for template editor UI or validation before saving custom templates
///
/// # Arguments
/// * `template_json` - Raw JSON string of the template
///
/// # Returns
/// Ok(template_name) if valid, Err(error_message) if invalid
#[tauri::command]
pub async fn api_validate_template<R: Runtime>(
    _app: tauri::AppHandle<R>,
    template_json: String,
) -> Result<String, String> {
    info!("api_validate_template called");

    match templates::validate_and_parse_template(&template_json) {
        Ok(template) => {
            info!("Template '{}' validated successfully", template.name);
            Ok(template.name)
        }
        Err(e) => {
            warn!("Template validation failed: {}", e);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_list_templates() {
        // This test requires the templates to be embedded/available
        // In a real test environment, you might want to mock the templates module

        // For now, just verify the function compiles and runs
        // You can expand this with more specific assertions
    }

    #[tokio::test]
    async fn test_validate_template_valid() {
        let valid_json = r#"
        {
            "name": "Test Template",
            "description": "A test template",
            "sections": [
                {
                    "title": "Summary",
                    "instruction": "Provide a summary",
                    "format": "paragraph"
                }
            ]
        }"#;

        // Mock app handle would be needed for actual testing
        // For now, test the validation logic directly
        let result = templates::validate_and_parse_template(valid_json);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_validate_template_invalid() {
        let invalid_json = "invalid json";

        let result = templates::validate_and_parse_template(invalid_json);
        assert!(result.is_err());
    }

    #[test]
    fn custom_template_save_rejects_unsafe_ids_and_round_trips() {
        let directory = tempfile::tempdir().unwrap();
        let json = r#"{"name":"My template","description":"Test","sections":[{"title":"Summary","instruction":"Summarize","format":"paragraph"}]}"#;
        assert!(save_template_to_dir(directory.path(), Some("../bad".into()), json).is_err());
        let saved = save_template_to_dir(directory.path(), None, json).unwrap();
        assert_eq!(saved.source, "custom");
        assert!(directory.path().join(format!("{}.json", saved.id)).is_file());
    }
}
