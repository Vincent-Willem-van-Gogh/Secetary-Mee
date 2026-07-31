import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => JSON.parse(
  fs.readFileSync(path.join(root, 'src/i18n/locales', name), 'utf8'),
);
const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)]
  .map((match) => match[1])
  .sort();

test('English and Simplified Chinese catalogs have identical keys and placeholders', () => {
  const en = read('en.json');
  const zhCN = read('zh-CN.json');

  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual(
      placeholders(zhCN[key]),
      placeholders(en[key]),
      `placeholder mismatch for "${key}"`,
    );
  }
});
