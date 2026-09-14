import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getHookStatus, runHookInstaller, runHookUninstall } from '../../src/hook/installer.js';

describe('installer status', () => {
  it('reports none installed on empty dir', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inst-'));
    const status = getHookStatus(dir);
    assert.equal(status.claude, false);
    assert.equal(status.cursor, false);
    assert.equal(status.opencode, false);
    assert.equal(status.codex, false);
    assert.equal(status.gemini, false);
    assert.equal(status.mcp, false);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reports installed after adapter install', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inst-'));
    const { installClaude } = await import('../../src/hook/platforms/claude.js');
    await installClaude(dir);
    const status = getHookStatus(dir);
    assert.equal(status.claude, true);
    assert.equal(status.cursor, false);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('runHookInstaller --all installs all platforms', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inst-'));
    const selected = await runHookInstaller(dir, { all: true });
    assert.deepEqual(selected.sort(), ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'].sort());
    const status = getHookStatus(dir);
    assert.equal(status.claude, true);
    assert.equal(status.cursor, true);
    assert.equal(status.opencode, true);
    assert.equal(status.codex, true);
    assert.equal(status.gemini, true);
    assert.equal(status.mcp, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('runHookInstaller --platforms filters correctly', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inst-'));
    const selected = await runHookInstaller(dir, { platforms: ['claude', 'cursor'] });
    assert.deepEqual(selected.sort(), ['claude', 'cursor'].sort());
    const status = getHookStatus(dir);
    assert.equal(status.claude, true);
    assert.equal(status.cursor, true);
    assert.equal(status.opencode, false);
    assert.equal(status.codex, false);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('runHookInstaller --platforms rejects invalid entries', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inst-'));
    const selected = await runHookInstaller(dir, { platforms: ['invalid', 'unknown'] });
    assert.deepEqual(selected, []);
    const status = getHookStatus(dir);
    assert.equal(status.claude, false);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('runHookUninstall --all removes all', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inst-'));
    await runHookInstaller(dir, { all: true });
    const removed = await runHookUninstall(dir, ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp']);
    assert.deepEqual(removed.sort(), ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'].sort());
    const status = getHookStatus(dir);
    assert.equal(status.claude, false);
    assert.equal(status.cursor, false);
    assert.equal(status.mcp, false);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
