import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Graph from 'graphology';
import { detectCycles, enrichCycles } from '../../src/graph/cycle-detector.js';

let tmpDir;
let origCwd;

describe('cycle-detector', () => {
  before(async () => {
    origCwd = process.cwd();
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-cyc-'));
    process.chdir(tmpDir);
  });

  after(async () => {
    process.chdir(origCwd);
    const fs = await import('node:fs/promises');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeGraph(edges) {
    const g = new Graph({ multi: true, directed: true });
    const allNodes = new Set();
    for (const [from, to] of edges) {
      allNodes.add(from);
      allNodes.add(to);
    }
    for (const node of allNodes) {
      g.addNode(node, { kind: 'file', label: path.basename(node), external: false });
    }
    for (const [from, to] of edges) {
      g.addEdge(from, to, { relationship: 'imports' });
    }
    return g;
  }

  function makeGraphWithEntities(edges) {
    const g = new Graph({ multi: true, directed: true });
    const allNodes = new Set();
    for (const [from, to] of edges) {
      allNodes.add(from);
      allNodes.add(to);
    }
    for (const node of allNodes) {
      const isEntity = node.includes('::');
      g.addNode(node, { 
        kind: isEntity ? 'function' : 'file', 
        label: isEntity ? node.split('::').pop() : path.basename(node), 
        external: false 
      });
    }
    for (const [from, to] of edges) {
      g.addEdge(from, to, { relationship: 'imports' });
    }
    return g;
  }

  test('detects simple 2-node cycle', () => {
    const g = makeGraph([
      ['/src/a.js', '/src/b.js'],
      ['/src/b.js', '/src/a.js'],
    ]);
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].length, 3); // a -> b -> a (closed)
    assert.ok(cycles[0].includes('/src/a.js'));
    assert.ok(cycles[0].includes('/src/b.js'));
  });

  test('detects 3-node cycle', () => {
    const g = makeGraph([
      ['/src/a.js', '/src/b.js'],
      ['/src/b.js', '/src/c.js'],
      ['/src/c.js', '/src/a.js'],
    ]);
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].length, 4); // a -> b -> c -> a
  });

  test('detects multiple separate cycles', () => {
    const g = makeGraph([
      ['/src/a.js', '/src/b.js'],
      ['/src/b.js', '/src/a.js'],
      ['/src/c.js', '/src/d.js'],
      ['/src/d.js', '/src/c.js'],
    ]);
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 2);
  });

  test('does not report duplicate cycles from different start points', () => {
    const g = makeGraph([
      ['/src/a.js', '/src/b.js'],
      ['/src/b.js', '/src/c.js'],
      ['/src/c.js', '/src/a.js'],
    ]);
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 1); // only one unique cycle
  });

  test('ignores external package nodes', () => {
    const g = new Graph({ multi: true, directed: true });
    g.addNode('/src/a.js', { kind: 'file', label: 'a.js', external: false });
    g.addNode('/src/b.js', { kind: 'file', label: 'b.js', external: false });
    g.addNode('express', { kind: 'file', label: 'express', external: true });
    g.addEdge('/src/a.js', '/src/b.js', { relationship: 'imports' });
    g.addEdge('/src/b.js', 'express', { relationship: 'imports' });
    g.addEdge('express', '/src/a.js', { relationship: 'imports' });
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 0); // 'express' is external, not in fileSet
  });

  test('ignores entity nodes (class/function/method)', () => {
    const g = makeGraphWithEntities([
      ['/src/a.js', '/src/b.js'],
      ['/src/b.js', '/src/a.js'],  // direct file-to-file cycle
      ['/src/b.js', '/src/a.js::someFunc'], // file -> entity (ignored for cycle detection)
    ]);
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 1); // a <-> b cycle exists
  });

  test('enrichCycles returns structured data', () => {
    const g = makeGraph([
      ['/src/a.js', '/src/b.js'],
      ['/src/b.js', '/src/a.js'],
    ]);
    const cycles = detectCycles(g);
    const enriched = enrichCycles(g, cycles);
    assert.equal(enriched.length, 1);
    assert.equal(enriched[0].id, 1);
    assert.equal(enriched[0].size, 2); // 2 unique files in cycle
    assert.equal(enriched[0].files.length, 3); // includes closing node (a -> b -> a)
    assert.ok(enriched[0].edges.length > 0);
    assert.ok(enriched[0].label.includes('a.js'));
    assert.ok(enriched[0].label.includes('b.js'));
  });

  test('no cycles in acyclic graph', () => {
    const g = makeGraph([
      ['/src/a.js', '/src/b.js'],
      ['/src/b.js', '/src/c.js'],
    ]);
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 0);
  });

  test('self-loop detected as cycle', () => {
    const g = makeGraph([
      ['/src/a.js', '/src/a.js'],
    ]);
    const cycles = detectCycles(g);
    assert.equal(cycles.length, 1);
  });
});