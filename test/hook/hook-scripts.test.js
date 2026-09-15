import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CURSOR_HOOK = path.resolve('src/hook/templates/cursor-hook.cjs');
const COPILOT_HOOK = path.resolve('src/hook/templates/copilot-hook.cjs');
const GEMINI_HOOK = path.resolve('src/hook/templates/gemini-hook.cjs');

function runHook(script, input, cwd) {
  const result = spawnSync('node', [script], {
    input: JSON.stringify(input),
    cwd,
    encoding: 'utf-8',
    timeout: 5000,
  });
  return {
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
    code: result.status ?? 1,
  };
}

describe('cursor-hook.cjs', () => {
  it('denies grep command when matches found in graph.json', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ key: 'src/app.js', attributes: { label: 'MyFunction', source_file: 'src/app.js', line: 10, kind: 'function' } }],
    }));
    const result = runHook(CURSOR_HOOK, { command: 'grep MyFunction src/' }, tmpDir);
    assert.ok(result.stdout.includes('"permission":"deny"'));
    assert.ok(result.stdout.includes('MyFunction'));
    await fs.rm(tmpDir, { recursive: true });
  });

  it('passes through non-grep commands', async () => {
    const result = runHook(CURSOR_HOOK, { command: 'npm install' });
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
  });

  it('passes through grep with --graph-tried', async () => {
    const result = runHook(CURSOR_HOOK, { command: 'grep foo src/ # --graph-tried' });
    assert.equal(result.stdout, '');
  });

  it('passes through when graph.json is missing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const result = runHook(CURSOR_HOOK, { command: 'grep validateToken src/' }, tmpDir);
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('passes through when no match in graph', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'otherFunc' }],
    }));
    const result = runHook(CURSOR_HOOK, { command: 'grep validateToken src/' }, tmpDir);
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('uses workspace_roots[0] for graph path', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ key: 'src/a.js', attributes: { label: 'handleAuth', source_file: 'src/a.js', line: 5, kind: 'function' } }],
    }));
    const result = runHook(CURSOR_HOOK, { command: 'grep handleAuth src/', workspace_roots: [tmpDir] }, '/tmp');
    assert.ok(result.stdout.includes('"permission":"deny"'));
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles graphology export shape (key/attributes)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ key: 'src/auth.ts', attributes: { label: 'validateToken', kind: 'function' } }],
    }));
    const result = runHook(CURSOR_HOOK, { command: 'grep validateToken src/' }, tmpDir);
    assert.ok(result.stdout.includes('validateToken'));
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles corrupted graph.json gracefully', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), '{ invalid');
    const result = runHook(CURSOR_HOOK, { command: 'grep validateToken src/' }, tmpDir);
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles empty stdin gracefully', async () => {
    const result = runHook(CURSOR_HOOK, null);
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
  });

  it('handles invalid JSON payload gracefully', async () => {
    const result = spawnSync('node', [CURSOR_HOOK], {
      input: 'not json',
      encoding: 'utf-8',
      timeout: 5000,
    });
    assert.equal((result.stdout || '').trim(), '');
    assert.equal(result.status, 0);
  });

  it('passes through grep with # graph-checked escape hatch', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'handleAuth' }],
    }));
    const result = runHook(CURSOR_HOOK, { command: 'grep handleAuth src/ # graph-checked' }, tmpDir);
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('passes through when pattern too short', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'a', label: 'ab' }],
    }));
    const result = runHook(CURSOR_HOOK, { command: 'grep ab' }, tmpDir);
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });
});

describe('copilot-hook.cjs', () => {
  it('denies grep command when matches found in graph.json', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ key: 'src/utils.js', attributes: { label: 'parseConfig', source_file: 'src/utils.js', line: 5, kind: 'function' } }],
    }));
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', toolArgs: { command: 'grep parseConfig src/' }, cwd: tmpDir });
    assert.ok(result.stdout.includes('"permissionDecision":"deny"'));
    assert.ok(result.stdout.includes('parseConfig'));
    assert.equal(result.code, 2);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('passes through non-grep commands', async () => {
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', toolArgs: { command: 'ls -la' } });
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
  });

  it('passes through grep with --graph-tried', async () => {
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', toolArgs: { command: 'grep foo src/ # --graph-tried' } });
    assert.equal(result.stdout, '');
  });

  it('passes through when graph.json is missing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', toolArgs: { command: 'grep validateToken src/' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('passes through when no match in graph', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'otherFunc' }],
    }));
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', toolArgs: { command: 'grep validateToken src/' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles tool_input.command fallback', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ key: 'src/db.js', attributes: { label: 'connectDB', source_file: 'src/db.js', line: 1, kind: 'function' } }],
    }));
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', tool_input: { command: 'grep connectDB src/' }, cwd: tmpDir });
    assert.ok(result.stdout.includes('"permissionDecision":"deny"'));
    assert.equal(result.code, 2);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles corrupted graph.json gracefully', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), '{ invalid');
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', toolArgs: { command: 'grep validateToken src/' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles empty stdin gracefully', async () => {
    const result = runHook(COPILOT_HOOK, null);
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
  });

  it('handles invalid JSON payload gracefully', async () => {
    const result = spawnSync('node', [COPILOT_HOOK], {
      input: 'not json',
      encoding: 'utf-8',
      timeout: 5000,
    });
    assert.equal((result.stdout || '').trim(), '');
    assert.equal(result.status, 0);
  });

  it('passes through grep with # graph-checked escape hatch', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'handleAuth' }],
    }));
    const result = runHook(COPILOT_HOOK, { toolName: 'bash', toolArgs: { command: 'grep handleAuth src/ # graph-checked' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });
});

describe('gemini-hook.cjs', () => {
  it('denies grep command when matches found in graph.json', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ key: 'src/db.js', attributes: { label: 'connectDB', source_file: 'src/db.js', line: 1, kind: 'function' } }],
    }));
    const result = runHook(GEMINI_HOOK, { tool_name: 'run_shell_command', tool_input: { command: 'grep connectDB src/' }, cwd: tmpDir });
    assert.ok(result.stdout.includes('"decision":"deny"'));
    assert.ok(result.stdout.includes('connectDB'));
    assert.equal(result.code, 0);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('passes through non-grep commands', async () => {
    const result = runHook(GEMINI_HOOK, { tool_name: 'run_shell_command', tool_input: { command: 'echo hello' } });
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
  });

  it('passes through grep with --graph-tried', async () => {
    const result = runHook(GEMINI_HOOK, { tool_name: 'run_shell_command', tool_input: { command: 'grep foo src/ # --graph-tried' } });
    assert.equal(result.stdout, '');
  });

  it('passes through when graph.json is missing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const result = runHook(GEMINI_HOOK, { tool_name: 'run_shell_command', tool_input: { command: 'grep validateToken src/' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('passes through when no match in graph', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'otherFunc' }],
    }));
    const result = runHook(GEMINI_HOOK, { tool_name: 'run_shell_command', tool_input: { command: 'grep validateToken src/' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles corrupted graph.json gracefully', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), '{ invalid');
    const result = runHook(GEMINI_HOOK, { tool_name: 'run_shell_command', tool_input: { command: 'grep validateToken src/' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('handles empty stdin gracefully', async () => {
    const result = runHook(GEMINI_HOOK, null);
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
  });

  it('handles invalid JSON payload gracefully', async () => {
    const result = spawnSync('node', [GEMINI_HOOK], {
      input: 'not json',
      encoding: 'utf-8',
      timeout: 5000,
    });
    assert.equal((result.stdout || '').trim(), '');
    assert.equal(result.status, 0);
  });

  it('passes through grep with # graph-checked escape hatch', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(tmpDir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'handleAuth' }],
    }));
    const result = runHook(GEMINI_HOOK, { tool_name: 'run_shell_command', tool_input: { command: 'grep handleAuth src/ # graph-checked' }, cwd: tmpDir });
    assert.equal(result.stdout, '');
    await fs.rm(tmpDir, { recursive: true });
  });
});
