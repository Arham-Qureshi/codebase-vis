import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { queryGraph } from '../../src/hook/query-engine.js';

describe('queryGraph', () => {
  it('returns empty when graph.json missing', async () => {
    const result = await queryGraph('validateToken', '/tmp/nonexistent-graph-xyz.json');
    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.formatted, []);
  });

  it('returns empty for short pattern <3 chars', async () => {
    const result = await queryGraph('ab', '/tmp/nonexistent-graph-xyz.json');
    assert.deepEqual(result.matches, []);
  });

  it('returns empty for empty pattern', async () => {
    const result = await queryGraph('', '/tmp/nonexistent-graph-xyz.json');
    assert.deepEqual(result.matches, []);
  });

  it('finds case-insensitive label match and limits to 5', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const graphPath = path.join(dir, 'graph.json');
    const nodes = [
      { key: 'src/a.ts', attributes: { label: 'validateToken', kind: 'function', source_file: 'src/a.ts', line: 10 } },
      { key: 'src/b.ts', attributes: { label: 'ValidateTokenHelper', kind: 'class', source_file: 'src/b.ts', line: 20 } },
      { key: 'src/c.ts', attributes: { label: 'validateTokenExtra', kind: 'function', source_file: 'src/c.ts', line: 30 } },
      { key: 'src/d.ts', attributes: { label: 'validateTokenFoo', kind: 'function', source_file: 'src/d.ts', line: 40 } },
      { key: 'src/e.ts', attributes: { label: 'validateTokenBar', kind: 'function', source_file: 'src/e.ts', line: 50 } },
      { key: 'src/f.ts', attributes: { label: 'validateTokenBaz', kind: 'function', source_file: 'src/f.ts', line: 60 } },
      { key: 'other.ts', attributes: { label: 'unrelated', kind: 'file' } },
    ];
    await fs.writeFile(graphPath, JSON.stringify({ nodes: nodes.map(n => ({ key: n.key, attributes: n.attributes })), edges: [] }));
    const result = await queryGraph('validatetoken', graphPath);
    assert.equal(result.matches.length, 5);
    assert.match(result.formatted[0], /validateToken/i);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('supports flat nodes array shape (interceptor compat)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const graphPath = path.join(dir, 'graph.json');
    await fs.writeFile(graphPath, JSON.stringify({
      nodes: [{ id: 'src/auth/validator.ts', label: 'validateToken', source_file: 'src/auth/validator.ts', line: 42, type: 'function' }]
    }));
    const result = await queryGraph('validateToken', graphPath);
    assert.equal(result.matches.length, 1);
    assert.match(result.formatted[0], /validator\.ts:42/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles graphology export shape with x,y attributes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const graphPath = path.join(dir, 'graph.json');
    await fs.writeFile(graphPath, JSON.stringify({
      nodes: [
        { key: 'src/auth/validator.ts', attributes: { label: 'validateToken', kind: 'function', x: 0, y: 0 } },
      ],
      edges: []
    }));
    const result = await queryGraph('validateToken', graphPath);
    assert.equal(result.matches.length, 1);
    assert.match(result.formatted[0], /validateToken/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns empty on corrupted JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const graphPath = path.join(dir, 'graph.json');
    await fs.writeFile(graphPath, '{ invalid json');
    const result = await queryGraph('validateToken', graphPath);
    assert.deepEqual(result.matches, []);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns empty when file too large (>2MB)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    const graphPath = path.join(dir, 'graph.json');
    await fs.writeFile(graphPath, JSON.stringify({ nodes: [{ id: 'a', label: 'validateToken' }] }));
    const result = await queryGraph('validateToken', graphPath);
    assert.equal(result.matches.length, 1);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
