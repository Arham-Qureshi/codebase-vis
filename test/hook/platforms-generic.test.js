import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installGemini, isInstalledGemini, uninstallGemini, installCopilot, isInstalledCopilot, uninstallCopilot } from '../../src/hook/platforms/generic.js';

describe('gemini platform', () => {
  let dir;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-'));
  });
  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('installs hook script to .gemini/hooks/', async () => {
    await installGemini(dir);
    const hookPath = path.join(dir, '.gemini', 'hooks', 'codebase-vis-hook.cjs');
    const stat = await fs.stat(hookPath);
    assert.ok(stat.isFile());
    const content = await fs.readFile(hookPath, 'utf-8');
    assert.match(content, /readFileSync\(0/);
  });

  it('creates .gemini/settings.json with BeforeTool entry', async () => {
    await installGemini(dir);
    const configPath = path.join(dir, '.gemini', 'settings.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.ok(Array.isArray(config.hooks.BeforeTool));
    const entry = config.hooks.BeforeTool.find(
      (h) => h.hooks?.some((hook) => hook.command?.includes('codebase-vis-hook'))
    );
    assert.ok(entry);
    assert.equal(entry.matcher, 'run_shell_command');
  });

  it('isInstalledGemini returns true after install', async () => {
    assert.equal(isInstalledGemini(dir), true);
  });

  it('is idempotent', async () => {
    await installGemini(dir);
    await installGemini(dir);
    const configPath = path.join(dir, '.gemini', 'settings.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const entries = config.hooks.BeforeTool.filter(
      (h) => h.hooks?.some((hook) => hook.command?.includes('codebase-vis-hook'))
    );
    assert.equal(entries.length, 1);
  });

  it('uninstall removes hook script and config entry', async () => {
    await installGemini(dir);
    await uninstallGemini(dir);
    assert.equal(isInstalledGemini(dir), false);
    const configPath = path.join(dir, '.gemini', 'settings.json');
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const entries = (config.hooks?.BeforeTool || []).filter(
        (h) => h.hooks?.some((hook) => hook.command?.includes('codebase-vis-hook'))
      );
      assert.equal(entries.length, 0);
    } catch {
      // config file may be removed if empty
    }
  });

  it('uninstall is safe when not installed', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-fresh-'));
    await uninstallGemini(fresh);
    assert.equal(isInstalledGemini(fresh), false);
    await fs.rm(fresh, { recursive: true, force: true });
  });
});

describe('copilot platform', () => {
  let dir;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-'));
  });
  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('installs hook script to .github/hooks/', async () => {
    await installCopilot(dir);
    const hookPath = path.join(dir, '.github', 'hooks', 'codebase-vis-hook.cjs');
    const stat = await fs.stat(hookPath);
    assert.ok(stat.isFile());
    const content = await fs.readFile(hookPath, 'utf-8');
    assert.match(content, /readFileSync\(0/);
  });

  it('creates .github/hooks/codebase-vis.json with preToolUse entry', async () => {
    await installCopilot(dir);
    const configPath = path.join(dir, '.github', 'hooks', 'codebase-vis.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.version, 1);
    assert.ok(Array.isArray(config.hooks.preToolUse));
    const entry = config.hooks.preToolUse.find(
      (h) => h.bash?.includes('codebase-vis-hook')
    );
    assert.ok(entry);
    assert.equal(entry.matcher, 'bash');
  });

  it('isInstalledCopilot returns true after install', async () => {
    assert.equal(isInstalledCopilot(dir), true);
  });

  it('is idempotent', async () => {
    await installCopilot(dir);
    await installCopilot(dir);
    const configPath = path.join(dir, '.github', 'hooks', 'codebase-vis.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const entries = config.hooks.preToolUse.filter(
      (h) => h.bash?.includes('codebase-vis-hook')
    );
    assert.equal(entries.length, 1);
  });

  it('preserves existing config entries', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-existing-'));
    const configPath = path.join(fresh, '.github', 'hooks', 'codebase-vis.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({
      version: 1,
      hooks: { preToolUse: [{ type: 'command', bash: './other-hook.sh' }] },
    }));
    await installCopilot(fresh);
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.hooks.preToolUse.length, 2);
    assert.ok(config.hooks.preToolUse.some((h) => h.bash === './other-hook.sh'));
    assert.ok(config.hooks.preToolUse.some((h) => h.bash?.includes('codebase-vis-hook')));
    await fs.rm(fresh, { recursive: true, force: true });
  });

  it('uninstall removes hook script and config entry', async () => {
    await installCopilot(dir);
    await uninstallCopilot(dir);
    assert.equal(isInstalledCopilot(dir), false);
    const configPath = path.join(dir, '.github', 'hooks', 'codebase-vis.json');
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const entries = (config.hooks?.preToolUse || []).filter(
        (h) => h.bash?.includes('codebase-vis-hook')
      );
      assert.equal(entries.length, 0);
    } catch {
      // config file may be removed if empty
    }
  });

  it('uninstall is safe when not installed', async () => {
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-fresh-'));
    await uninstallCopilot(fresh);
    assert.equal(isInstalledCopilot(fresh), false);
    await fs.rm(fresh, { recursive: true, force: true });
  });
});
