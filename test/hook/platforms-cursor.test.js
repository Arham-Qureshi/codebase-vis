import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installCursor, isInstalledCursor, uninstallCursor } from '../../src/hook/platforms/cursor.js';

describe('cursor platform', () => {
  let dir;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-'));
  });
  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes mdc rule with alwaysApply', async () => {
    await installCursor(dir);
    assert.equal(isInstalledCursor(dir), true);
    const content = await fs.readFile(path.join(dir, '.cursor', 'rules', 'codebase-vis.mdc'), 'utf-8');
    assert.match(content, /alwaysApply:\s*true/);
    assert.match(content, /graph\.json/);
    assert.match(content, /--graph-tried/);
  });

  it('is idempotent', async () => {
    await installCursor(dir);
    await installCursor(dir);
    assert.equal(isInstalledCursor(dir), true);
  });

  it('uninstall removes file', async () => {
    await uninstallCursor(dir);
    assert.equal(isInstalledCursor(dir), false);
    await installCursor(dir);
  });

  it('uninstall is safe when not installed', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-fresh-'));
    await uninstallCursor(fresh);
    assert.equal(isInstalledCursor(fresh), false);
    await fs.rm(fresh, { recursive: true, force: true });
  });
});
