import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installClaude, isInstalledClaude, uninstallClaude } from '../../src/hook/platforms/claude.js';

describe('claude platform', () => {
  let dir;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-'));
  });
  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('installs hook and settings', async () => {
    await installClaude(dir);
    assert.equal(isInstalledClaude(dir), true);
    const hookExists = await fs.stat(path.join(dir, '.codebase-vis', 'smart-grep-hook.cjs')).then(() => true).catch(() => false);
    assert.equal(hookExists, true);
    const settings = JSON.parse(await fs.readFile(path.join(dir, '.claude', 'settings.local.json'), 'utf-8'));
    assert.ok(settings.hooks.PreToolUse.some(h => h.matcher === 'Bash'));
    const hasHook = settings.hooks.PreToolUse.some(h => JSON.stringify(h).includes('smart-grep-hook'));
    assert.equal(hasHook, true);
    const hasCjs = settings.hooks.PreToolUse.some(h => JSON.stringify(h).includes('smart-grep-hook.cjs'));
    assert.equal(hasCjs, true);
  });

  it('is idempotent', async () => {
    await installClaude(dir);
    await installClaude(dir);
    assert.equal(isInstalledClaude(dir), true);
    const settings = JSON.parse(await fs.readFile(path.join(dir, '.claude', 'settings.local.json'), 'utf-8'));
    const count = settings.hooks.PreToolUse.filter(h => JSON.stringify(h).includes('smart-grep-hook')).length;
    assert.equal(count, 1);
  });

  it('uninstalls cleanly', async () => {
    await uninstallClaude(dir);
    assert.equal(isInstalledClaude(dir), false);
    // After clean uninstall, settings file may be removed if it only contained our hook; check both cases
    try {
      const settings = JSON.parse(await fs.readFile(path.join(dir, '.claude', 'settings.local.json'), 'utf-8'));
      const hasHook = (settings.hooks.PreToolUse || []).some(h => JSON.stringify(h).includes('smart-grep-hook'));
      assert.equal(hasHook, false);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      // File was cleaned up because it only contained our hook and became empty — also valid
      const hookExists = await fs.stat(path.join(dir, '.codebase-vis', 'smart-grep-hook.cjs')).then(() => true).catch(() => false);
      assert.equal(hookExists, false);
    }
    // Verify .codebase-vis is cleaned up when empty
    const codebaseVisExists = await fs.stat(path.join(dir, '.codebase-vis')).then(() => true).catch(() => false);
    assert.equal(codebaseVisExists, false);
  });

  it('preserves existing settings', async () => {
    const settingsPath = path.join(dir, '.claude', 'settings.local.json');
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Other', hooks: [{ type: 'command', command: 'echo hi' }] }] } }));
    await installClaude(dir);
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
    assert.ok(settings.hooks.PreToolUse.some(h => h.matcher === 'Other'));
    assert.ok(settings.hooks.PreToolUse.some(h => JSON.stringify(h).includes('smart-grep-hook')));
    await uninstallClaude(dir);
  });
});
