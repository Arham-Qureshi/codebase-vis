import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_HOOK = path.resolve('src/hook/templates/smart-grep-hook.cjs');
const CURSOR_HOOK = path.resolve('src/hook/templates/cursor-hook.cjs');
const COPILOT_HOOK = path.resolve('src/hook/templates/copilot-hook.cjs');
const GEMINI_HOOK = path.resolve('src/hook/templates/gemini-hook.cjs');

describe('claude hook e2e', () => {
  it('blocks grep with graph match', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'codebase-out', 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'src/a.ts', label: 'validateToken', line: 42, type: 'function' }] })
    );
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken src/' } });
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
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
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
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
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
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
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through when not a search command', async () => {
    const payload = JSON.stringify({ tool_input: { command: 'echo hello' } });
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
  });

  it('passes through when pattern too short', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'a', label: 'ab' }] }));
    const payload = JSON.stringify({ tool_input: { command: 'grep ab' } });
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through when graph.json missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken' } });
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes through when no match in graph', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'src/a.ts', label: 'otherFunc' }] }));
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken' } });
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles corrupted graph.json gracefully', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), '{ invalid');
    const payload = JSON.stringify({ tool_input: { command: 'grep validateToken' } });
    const result = spawnSync('node', [CLAUDE_HOOK], { input: payload, cwd: dir, encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles empty stdin gracefully', async () => {
    const result = spawnSync('node', [CLAUDE_HOOK], { input: '', encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
  });

  it('handles invalid JSON payload gracefully', async () => {
    const result = spawnSync('node', [CLAUDE_HOOK], { input: 'not json', encoding: 'utf-8' });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
  });
});

describe('cursor hook e2e', () => {
  it('denies grep with match in graph.json', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/db.js', label: 'connectDB', type: 'function', line: 10 }],
    }));
    const result = spawnSync('node', [CURSOR_HOOK], {
      input: JSON.stringify({ tool_input: { command: 'grep connectDB src/' }, cwd: dir }),
      cwd: dir, encoding: 'utf-8',
    });
    assert.match(result.stdout, /codebase-vis/);
    assert.match(result.stdout, /connectDB/);
    assert.match(result.stdout, /permission/);
    assert.match(result.stdout, /deny/);
    assert.equal(result.status, 0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes non-grep commands', async () => {
    const result = spawnSync('node', [CURSOR_HOOK], {
      input: JSON.stringify({ tool_input: { command: 'echo hello' } }),
      encoding: 'utf-8',
    });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
  });

  it('passes --graph-tried escape hatch', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'handleAuth' }],
    }));
    const result = spawnSync('node', [CURSOR_HOOK], {
      input: JSON.stringify({ tool_input: { command: 'grep handleAuth src/ # --graph-tried' }, cwd: dir }),
      cwd: dir, encoding: 'utf-8',
    });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('copilot hook e2e', () => {
  it('denies bash grep with match in graph.json', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/auth.js', attributes: { label: 'verifyToken', kind: 'function' } }],
    }));
    const result = spawnSync('node', [COPILOT_HOOK], {
      input: JSON.stringify({ toolName: 'bash', toolArgs: { command: 'grep verifyToken src/' }, cwd: dir }),
      cwd: dir, encoding: 'utf-8',
    });
    assert.match(result.stdout, /permissionDecision/);
    assert.match(result.stdout, /deny/);
    assert.match(result.stdout, /verifyToken/);
    assert.ok(result.status === 0 || result.status === 2);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes non-bash tool calls', async () => {
    const result = spawnSync('node', [COPILOT_HOOK], {
      input: JSON.stringify({ toolName: 'readFile', toolArgs: { filePath: 'src/index.js' } }),
      encoding: 'utf-8',
    });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
  });

  it('passes --graph-tried escape hatch', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'handleAuth' }],
    }));
    const result = spawnSync('node', [COPILOT_HOOK], {
      input: JSON.stringify({ toolName: 'bash', toolArgs: { command: 'grep handleAuth src/ # --graph-tried' }, cwd: dir }),
      cwd: dir, encoding: 'utf-8',
    });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('gemini hook e2e', () => {
  it('denies run_shell_command grep with match in graph.json', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ key: 'src/api.js', attributes: { label: 'handleRequest', source_file: 'src/api.js', line: 5, kind: 'function' } }],
    }));
    const result = spawnSync('node', [GEMINI_HOOK], {
      input: JSON.stringify({ tool_name: 'run_shell_command', tool_input: { command: 'grep handleRequest src/' }, cwd: dir }),
      cwd: dir, encoding: 'utf-8',
    });
    assert.match(result.stdout, /"decision":"deny"/);
    assert.match(result.stdout, /handleRequest/);
    assert.equal(result.status, 0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes non-shell tool calls', async () => {
    const result = spawnSync('node', [GEMINI_HOOK], {
      input: JSON.stringify({ tool_name: 'read_file', tool_input: { file_path: 'src/index.js' } }),
      encoding: 'utf-8',
    });
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.status, 0);
  });

  it('passes --graph-tried escape hatch', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({
      nodes: [{ id: 'src/a.js', label: 'handleAuth' }],
    }));
    const result = spawnSync('node', [GEMINI_HOOK], {
      input: JSON.stringify({ tool_name: 'run_shell_command', tool_input: { command: 'grep handleAuth src/ # --graph-tried' }, cwd: dir }),
      cwd: dir, encoding: 'utf-8',
    });
    assert.equal(result.stdout.trim(), '');
    await fs.rm(dir, { recursive: true, force: true });
  });
});
