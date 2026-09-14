import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const HOOK_PATH = path.resolve('src/hook/templates/smart-grep-hook.cjs');

describe('interceptor e2e', () => {
  it('blocks grep with graph match', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'codebase-out', 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'src/a.ts', label: 'validateToken', line: 42, type: 'function' }] })
    );
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken src/' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.match(result.stdout, /codebase-vis/);
    assert.match(result.stdout, /validateToken/);
    assert.match(result.stdout, /permissionDecision/);
    assert.match(result.stdout, /deny/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles graphology export shape', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'codebase-out', 'graph.json'),
      JSON.stringify({ nodes: [{ key: 'src/auth/validator.ts', attributes: { label: 'validateToken', kind: 'function' } }], edges: [] })
    );
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.match(result.stdout, /validateToken/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through with escape hatch --graph-tried', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'codebase-out', 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'src/a.ts', label: 'validateToken' }] })
    );
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken --graph-tried' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through with escape hatch # graph-checked', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'codebase-out', 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'src/a.ts', label: 'validateToken' }] })
    );
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken # graph-checked' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through when not a search command', async () => {
    const payload = JSON.stringify({ tool_input: { command: 'echo hello' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
  });

  it('passes through when pattern too short', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'a', label: 'ab' }] }));
    const payload = JSON.stringify({ tool_input: { command: 'grep ab' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through when graph.json missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through when no match in graph', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'src/a.ts', label: 'otherFunc' }] }));
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles corrupted graph.json gracefully', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), '{ invalid');
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken' } });
    const result = spawnSync('node', [HOOK_PATH], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles empty stdin gracefully', async () => {
    const result = spawnSync('node', [HOOK_PATH], { input: '', encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
  });

  it('handles invalid JSON payload gracefully', async () => {
    const result = spawnSync('node', [HOOK_PATH], { input: 'not json', encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
  });
});
