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

  it('installs hook script to .cursor/hooks/', async () => {
    await installCursor(dir);
    const hookPath = path.join(dir, '.cursor', 'hooks', 'codebase-vis-hook.cjs');
    const stat = await fs.stat(hookPath);
    assert.ok(stat.isFile());
    const content = await fs.readFile(hookPath, 'utf-8');
    assert.match(content, /readFileSync\(0/);
  });

  it('creates .cursor/hooks.json with beforeShellExecution entry', async () => {
    await installCursor(dir);
    const configPath = path.join(dir, '.cursor', 'hooks.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.version, 1);
    assert.ok(Array.isArray(config.hooks.beforeShellExecution));
    const entry = config.hooks.beforeShellExecution.find(
      (h) => h.command?.includes('codebase-vis-hook')
    );
    assert.ok(entry);
    assert.match(entry.matcher, /grep/);
  });

  it('isInstalledCursor returns true after install', async () => {
    assert.equal(isInstalledCursor(dir), true);
  });

  it('is idempotent', async () => {
    await installCursor(dir);
    await installCursor(dir);
    const configPath = path.join(dir, '.cursor', 'hooks.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const entries = config.hooks.beforeShellExecution.filter(
      (h) => h.command?.includes('codebase-vis-hook')
    );
    assert.equal(entries.length, 1);
  });

  it('preserves existing hooks.json entries', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-existing-'));
    const configPath = path.join(fresh, '.cursor', 'hooks.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({
      version: 1,
      hooks: { beforeShellExecution: [{ command: './other-hook.sh' }] },
    }));
    await installCursor(fresh);
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.hooks.beforeShellExecution.length, 2);
    assert.ok(config.hooks.beforeShellExecution.some((h) => h.command === './other-hook.sh'));
    assert.ok(config.hooks.beforeShellExecution.some((h) => h.command?.includes('codebase-vis-hook')));
    await fs.rm(fresh, { recursive: true, force: true });
  });

  it('uninstall removes hook script and config entry', async () => {
    await installCursor(dir);
    await uninstallCursor(dir);
    assert.equal(isInstalledCursor(dir), false);
    const configPath = path.join(dir, '.cursor', 'hooks.json');
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const entries = (config.hooks?.beforeShellExecution || []).filter(
        (h) => h.command?.includes('codebase-vis-hook')
      );
      assert.equal(entries.length, 0);
    } catch {
      // config file may be removed if empty
    }
  });

  it('uninstall is safe when not installed', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-fresh-'));
    await uninstallCursor(fresh);
    assert.equal(isInstalledCursor(fresh), false);
    await fs.rm(fresh, { recursive: true, force: true });
  });

  it('does not create .mdc file', async () => {
    await installCursor(dir);
    const mdcPath = path.join(dir, '.cursor', 'rules', 'codebase-vis.mdc');
    try {
      await fs.stat(mdcPath);
      assert.fail('.mdc file should not exist');
    } catch (err) {
      assert.equal(err.code, 'ENOENT');
    }
  });
});
