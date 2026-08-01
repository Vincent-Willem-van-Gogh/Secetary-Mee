import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  sidebar,
  mainContent,
  statusOverlays,
  controls,
  page,
  transcript,
  draft,
  toggle,
  settings,
  transcriptSettings,
  modelHook,
  modelManager,
  retranscribeDialog,
  importDialog,
  backend,
  livePreview,
  css,
] = await Promise.all([
  readFile(new URL('../../src/components/Sidebar/index.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/MainContent/index.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/_components/StatusOverlays.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/RecordingControls.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/_components/TranscriptPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/LiveDraftPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/Sidebar/SidebarToggleButton.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/settings/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/TranscriptSettings.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/hooks/useTranscriptionModels.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/WhisperModelManager.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/MeetingDetails/RetranscribeDialog.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/ImportAudio/ImportAudioDialog.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/lib.rs', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/live_preview.rs', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/globals.css', import.meta.url), 'utf8'),
]);

test('sidebar meets the main wall at its existing border', () => {
  assert.match(sidebar, /border-r border-border/);
  assert.match(mainContent, /isCollapsed \? 'ml-16' : 'ml-64'/);
  assert.doesNotMatch(mainContent, /pl-8/);
  assert.doesNotMatch(statusOverlays, /pl-8/);
});

test('light sidebar and idle recording controls use the shared Apple palette', () => {
  assert.match(sidebar, /bg-card text-foreground[^\n]+dark:bg-black/);
  assert.match(sidebar, /bg-primary hover:bg-primary\/90/);
  assert.match(controls, /bg-primary hover:bg-primary\/90/);
  assert.match(sidebar, /sidebar-meeting-active/);
  assert.match(css, /\.dark \.sidebar-meeting-active[\s\S]*background: #272729 !important;[\s\S]*color: #ffffff !important;/);
});

test('recording preview is docked below the wall and wall controls share its header', () => {
  assert.match(page, /grid-rows-\[minmax\(0,1fr\)_auto\]/);
  assert.doesNotMatch(draft, /max-w-\[750px\]|Sherpa live preview/);
  assert.match(draft, /h-\[114px\] w-full/);
  assert.doesNotMatch(sidebar, /absolute -right-6 top-20/);
  assert.match(transcript, /<SidebarToggleButton \/>/);
  assert.doesNotMatch(transcript, /mt-3 grid grid-cols-2 border-t pt-2/);
  assert.match(toggle, /variant="ghost"/);
  assert.match(toggle, /border-0 bg-transparent/);
  assert.match(controls, /isPaused \? 'bg-orange-500' : 'bg-primary'/);
});

test('main wall toolbar stays 40px tall with 30px controls', () => {
  assert.match(transcript, /px-4 py-\[5px\]/);
  assert.match(transcript, /h-\[30px\][^"\n]+\[&_button\]:h-\[30px\][^"\n]+\[&_button\]:min-h-\[30px\]/);
  assert.match(transcript, /\[&>button\]:w-\[30px\]/);
  assert.doesNotMatch(transcript, /grid h-7 grid-cols-2/);
});

test('settings header and tabs use the compact balanced layout', () => {
  assert.match(settings, /px-8 py-\[5px\]/);
  assert.match(settings, /flex h-\[30px\] items-center gap-4/);
  assert.match(settings, /\[&_button\]:h-\[30px\][^"\n]+\[&_button\]:min-h-\[30px\][^"\n]+\[&_button\]:w-\[30px\]/);
  assert.match(settings, /h-\[30px\] min-h-\[30px\][^"\n]+text-xs/);
  assert.match(settings, /text-lg font-semibold/);
  assert.match(settings, /px-8 pb-8 pt-2/);
  assert.doesNotMatch(settings, /TabsContent value="beta" className="mt-6"/);
});

test('toast close control stays circular without changing global button sizing', () => {
  assert.match(css, /\[data-close-button\][\s\S]*width: 20px;[\s\S]*min-width: 20px;[\s\S]*height: 20px;[\s\S]*min-height: 20px;[\s\S]*border-radius: 50%;/);
  assert.match(css, /button,[\s\S]*min-height: 44px;/);
});

test('local Whisper Large V3 remains visible for both batch transcription flows', () => {
  assert.match(modelHook, /m\.status === 'Available' \|\| m\.name === 'large-v3'/);
  assert.match(modelHook, /name: 'large-v3'[\s\S]*size_mb: 2951,[\s\S]*status: 'Missing'/);
  assert.match(modelHook, /provider === 'parakeet' && m\.status === 'Available'/);
  for (const dialog of [retranscribeDialog, importDialog]) {
    assert.match(dialog, /model\.status !== 'Available'/);
    assert.match(dialog, /formatModelSize\(model\.size_mb\)/);
    assert.match(dialog, /\/settings\?tab=Transcriptionmodels&provider=localWhisper/);
    assert.match(dialog, /!selectedModelAvailable/);
  }
});

test('downloading a Whisper model does not silently change the recording default', () => {
  assert.doesNotMatch(modelManager, /onModelSelectRef\.current\(modelName\)/);
  assert.match(modelManager, /const selectModel = async \(modelName: string\)/);
  assert.match(settings, /params\.get\('provider'\) === 'localWhisper'/);
  assert.match(transcriptSettings, /setUiProvider\(initialProvider \?\? transcriptModelConfig\.provider\)/);
});

test('recording start cannot race and live preview state survives panel mounting', () => {
  assert.match(controls, /setIsStarting\(true\)/);
  assert.match(controls, /finally[\s\S]*setIsStarting\(false\)/);
  assert.match(backend, /acquire_recording_start/);
  assert.match(backend, /stop_session_if\(preview_session_id\)/);
  assert.match(livePreview, /get_live_preview_status/);
  assert.match(draft, /invoke<LiveDraftUpdate>\('get_live_preview_status'\)/);
});
