import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { tryMcpQuery, formatMatches } from '../../src/hook/mcp-client.js';

describe('mcp-client', () => {
  it('returns null for short pattern', async () => {
    const result = await tryMcpQuery('ab', process.cwd(), 10);
    assert.equal(result, null);
  });

  it('returns null when .mcp.json missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-missing-'));
    const result = await tryMcpQuery('validateToken', dir, 10);
    assert.equal(result, null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns null for escape hatch', async () => {
    const result = await tryMcpQuery('validateToken --graph-tried', process.cwd(), 10);
    assert.equal(result, null);
  });

  it('returns null on timeout (no server)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-timeout-'));
    await fs.writeFile(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { 'codebase-vis': { command: 'npx', args: ['codebase-vis', 'serve', '--mcp'] } } }));
    await fs.mkdir(path.join(dir, 'codebase-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'codebase-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'a', label: 'validateToken' }] }));
    const result = await tryMcpQuery('validateToken', dir, 50);
    // Should timeout and return null (no real server in test, spawn will fail or timeout)
    assert.equal(result, null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('formatMatches formats correctly', () => {
    const formatted = formatMatches([{ label: 'validateToken', file: 'src/auth.js', line: 42, kind: 'function' }]);
    assert.equal(formatted[0], '[codebase-vis] function validateToken -> src/auth.js:42');
  });

  it('formatMatches caps at 5', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `func${i}`, file: `src/${i}.js`, line: i }));
    const formatted = formatMatches(many);
    assert.equal(formatted.length, 5);
  });
});
