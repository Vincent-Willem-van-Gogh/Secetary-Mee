import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [settings, credentials, translation, modelModal, backendApi, backendTranslation, backendLib] = await Promise.all([
  readFile(new URL('../../src/app/settings/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/CredentialSettings.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/TranscriptSettings.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/ModelSettingsModal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/api/api.rs', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/translation.rs', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/lib.rs', import.meta.url), 'utf8'),
]);

test('credentials are centralized and deep-linkable', () => {
  assert.match(settings, /value: 'credentials'/);
  assert.match(settings, /requestedCredentialProvider/);
  assert.match(credentials, /save_cloud_credential/);
  assert.match(credentials, /test_cloud_credential/);
  assert.match(credentials, /delete_cloud_credential/);
});

test('summary and translation screens never request saved secret values', () => {
  assert.doesNotMatch(modelModal, /api_get_api_key/);
  assert.doesNotMatch(translation, /api_get_api_key|api_get_transcript_api_key/);
  assert.match(modelModal, /Manage API Credentials/);
  assert.match(translation, /Manage API Credentials/);
  assert.doesNotMatch(backendLib, /api::api_get_api_key|api::api_get_transcript_api_key/);
});

test('safe configuration responses expose only credential status', () => {
  assert.match(backendApi, /serde\(rename = "hasApiKey"\)/);
  assert.doesNotMatch(backendApi, /pub async fn api_get_api_key/);
  assert.match(backendTranslation, /get_api_key\(state\.db_manager\.pool\(\), "groq"\)/);
  assert.doesNotMatch(backendTranslation, /UPDATE transcript_settings SET groqApiKey/);
});
