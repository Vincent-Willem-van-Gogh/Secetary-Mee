import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [settings, preferences, toolbar, page, backend, summary, api] = await Promise.all([
  readFile(new URL('../../src/app/settings/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/PreferenceSettings.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/MeetingDetails/TranscriptButtonGroup.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/meeting-details/page-content.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/note_export.rs', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/summary/service.rs', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/api/api.rs', import.meta.url), 'utf8'),
]);

test('general owns system settings and credentials follows it', () => {
  assert.doesNotMatch(settings, /value: 'system'/);
  assert.match(settings, /value: 'general'[\s\S]*value: 'credentials'/);
  assert.match(settings, /rawTab === 'system' \? 'general'/);
  assert.match(settings, /<SystemSettings \/>[\s\S]*<PreferenceSettings \/>/);
});

test('note storage and format use native Tauri commands', () => {
  assert.match(preferences, /get_note_export_preferences/);
  assert.match(preferences, /choose_note_export_folder/);
  assert.match(preferences, /reset_note_export_folder/);
  assert.match(preferences, /set_note_export_format/);
  assert.match(preferences, /Markdown \(\.md\)/);
  assert.match(preferences, /Plain Text/);
});

test('meeting toolbar saves notes and automatic summary and title paths refresh exports', () => {
  assert.match(toolbar, /save_meeting_note/);
  assert.match(toolbar, /t\('Save Note'\)/);
  assert.doesNotMatch(toolbar, /open_recording_folder/);
  assert.match(page, /export_meeting_note/);
  assert.match(backend, /atomic_write/);
  assert.match(backend, /translation_zh_cn/);
  assert.match(summary, /refresh_if_exported/);
  assert.match(api, /api_save_meeting_title[\s\S]*refresh_if_exported/);
});
