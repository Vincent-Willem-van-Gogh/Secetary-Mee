import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [css, rust, provider] = await Promise.all([
  readFile(new URL('../../src/app/globals.css', import.meta.url), 'utf8'),
  readFile(new URL('../../src-tauri/src/ui_language.rs', import.meta.url), 'utf8'),
  readFile(new URL('../../src/theme/index.tsx', import.meta.url), 'utf8'),
]);

test('Apple light and dark action colors remain part of the theme contract', () => {
  assert.match(css, /--background: 240 6% 96%/);
  assert.match(css, /--primary: 210 100% 40%/);
  assert.match(css, /\.dark[\s\S]*--background: 0 0% 0%/);
  assert.match(css, /\.dark[\s\S]*--primary: 210 100% 58%/);
});

test('theme choices stay limited to light, dark, and system with system as default', () => {
  for (const value of ['light', 'dark', 'system']) {
    assert.match(rust, new RegExp(`"${value}"`));
    assert.match(provider, new RegExp(`'${value}'`));
  }
  assert.match(rust, /#\[default\]\s+System/);
  assert.match(provider, /useState<UiTheme>\('system'\)/);
});
