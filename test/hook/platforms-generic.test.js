import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installCodex, installGemini, isInstalledCodex, isInstalledGemini, uninstallCodex, uninstallGemini } from '../../src/hook/platforms/generic.js';

describe('generic markdown platforms', () => {
  let dir;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'generic-'));
  });
  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('installs AGENTS.md block idempotently', async () => {
    await installCodex(dir);
    await installCodex(dir);
    const content = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    const count = (content.match(/codebase-vis:hook:start/g) || []).length;
    assert.equal(count, 1);
    assert.equal(isInstalledCodex(dir), true);
    assert.match(content, /graph\.json/);
    assert.match(content, /--graph-tried/);
  });

  it('installs GEMINI.md block', async () => {
    await installGemini(dir);
    assert.equal(isInstalledGemini(dir), true);
    const content = await fs.readFile(path.join(dir, 'GEMINI.md'), 'utf-8');
    assert.match(content, /codebase-vis:hook:start/);
  });

  it('is idempotent for GEMINI.md', async () => {
    await installGemini(dir);
    await installGemini(dir);
    const content = await fs.readFile(path.join(dir, 'GEMINI.md'), 'utf-8');
    const count = (content.match(/codebase-vis:hook:start/g) || []).length;
    assert.equal(count, 1);
  });

  it('uninstall removes AGENTS.md block', async () => {
    await uninstallCodex(dir);
    assert.equal(isInstalledCodex(dir), false);
  });

  it('uninstall removes GEMINI.md block', async () => {
    await uninstallGemini(dir);
    assert.equal(isInstalledGemini(dir), false);
  });

  it('preserves existing content', async () => {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '# My Agents\n\nSome content\n');
    await installCodex(dir);
    const content = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.match(content, /My Agents/);
    assert.match(content, /Some content/);
    assert.match(content, /codebase-vis:hook:start/);
    await uninstallCodex(dir);
    const after = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.match(after, /My Agents/);
    assert.equal(after.includes('codebase-vis:hook:start'), false);
  });
});
