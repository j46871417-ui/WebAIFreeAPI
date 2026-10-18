import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeShared } from '../scripts/materialize-vscode-shared.mjs';

test('shared sources refresh from one canonical copy and preserve platform files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-free-shared-'));
  try {
    fs.mkdirSync(path.join(root, 'plugin-for-vscode/src/state'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugin-for-vscode/shared-files.json'), JSON.stringify(['src/shared.mjs']));
    fs.writeFileSync(path.join(root, 'src/shared.mjs'), 'export const value = 1;');
    fs.writeFileSync(path.join(root, 'plugin-for-vscode/src/state/platform.mjs'), 'platform code');
    materializeShared(root);
    fs.writeFileSync(path.join(root, 'src/shared.mjs'), 'export const value = 2;');
    materializeShared(root);
    assert.equal(fs.readFileSync(path.join(root, 'plugin-for-vscode/src/shared.mjs'), 'utf8'), 'export const value = 2;');
    assert.equal(fs.readFileSync(path.join(root, 'plugin-for-vscode/src/state/platform.mjs'), 'utf8'), 'platform code');
    fs.writeFileSync(path.join(root, 'plugin-for-vscode/shared-files.json'), JSON.stringify(['../outside.mjs']));
    assert.throws(() => materializeShared(root), /Invalid shared source/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
