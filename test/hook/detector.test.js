import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectWorkspace } from '../../src/hook/detector.js';

describe('detectWorkspace', () => {
  it('detects empty workspace as all false except mcp', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    const d = detectWorkspace(dir);
    assert.equal(d.claude, false);
    assert.equal(d.cursor, false);
    assert.equal(d.opencode, false);
    assert.equal(d.codex, false);
    assert.equal(d.gemini, false);
    assert.equal(d.mcp, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects .claude directory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.mkdir(path.join(dir, '.claude'));
    const d = detectWorkspace(dir);
    assert.equal(d.claude, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects opencode via .opencode dir', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.mkdir(path.join(dir, '.opencode'));
    const d = detectWorkspace(dir);
    assert.equal(d.opencode, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects opencode via opencode.json', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.writeFile(path.join(dir, 'opencode.json'), '{}');
    const d = detectWorkspace(dir);
    assert.equal(d.opencode, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects opencode via opencode.jsonc', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.writeFile(path.join(dir, 'opencode.jsonc'), '{}');
    const d = detectWorkspace(dir);
    assert.equal(d.opencode, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects cursor via .cursor dir', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.mkdir(path.join(dir, '.cursor'));
    const d = detectWorkspace(dir);
    assert.equal(d.cursor, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects codex via AGENTS.md', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '# agents');
    const d = detectWorkspace(dir);
    assert.equal(d.codex, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects gemini via GEMINI.md', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.writeFile(path.join(dir, 'GEMINI.md'), '# gemini');
    const d = detectWorkspace(dir);
    assert.equal(d.gemini, true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects gemini via .gemini dir', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'det-'));
    await fs.mkdir(path.join(dir, '.gemini'));
    const d = detectWorkspace(dir);
    assert.equal(d.gemini, true);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
