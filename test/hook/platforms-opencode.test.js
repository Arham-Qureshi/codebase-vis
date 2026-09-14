import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installOpencode, isInstalledOpencode, uninstallOpencode } from '../../src/hook/platforms/opencode.js';

describe('opencode platform', () => {
  let dir;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-'));
  });
  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('installs plugin with tool.execute.before', async () => {
    await installOpencode(dir);
    assert.equal(isInstalledOpencode(dir), true);
    const content = await fs.readFile(path.join(dir, '.opencode', 'plugins', 'codebase-vis-hook.ts'), 'utf-8');
    assert.match(content, /tool\.execute\.before/);
    assert.match(content, /Bun\.file/);
    assert.match(content, /--graph-tried/);
    assert.match(content, /codebase-vis/);
  });

  it('is idempotent', async () => {
    await installOpencode(dir);
    await installOpencode(dir);
    assert.equal(isInstalledOpencode(dir), true);
  });

  it('uninstall removes plugin', async () => {
    await uninstallOpencode(dir);
    assert.equal(isInstalledOpencode(dir), false);
  });

  it('uninstall is safe when not installed', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-fresh-'));
    await uninstallOpencode(fresh);
    assert.equal(isInstalledOpencode(fresh), false);
    await fs.rm(fresh, { recursive: true, force: true });
  });
});
