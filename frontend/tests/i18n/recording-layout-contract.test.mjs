import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [sidebar, mainContent, statusOverlays, controls, page, transcript, draft, toggle, settings, css] = await Promise.all([
  readFile(new URL('../../src/components/Sidebar/index.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/MainContent/index.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/_components/StatusOverlays.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/RecordingControls.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/_components/TranscriptPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/LiveDraftPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/Sidebar/SidebarToggleButton.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/app/settings/page.tsx', import.meta.url), 'utf8'),
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
  assert.match(settings, /h-\[30px\] min-h-\[30px\][^"\n]+text-base/);
  assert.match(settings, /text-lg font-semibold/);
  assert.match(settings, /px-8 pb-8 pt-2/);
  assert.doesNotMatch(settings, /TabsContent value="beta" className="mt-6"/);
});
