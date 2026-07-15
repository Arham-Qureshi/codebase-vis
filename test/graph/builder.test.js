import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

let tmpDir;
let origCwd;

before(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-bld-'));
  process.chdir(tmpDir);
});

after(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('empty input returns empty graph', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const graph = buildGraph([]);
  assert.equal(graph.order, 0);
  assert.equal(graph.size, 0);
});

test('creates file nodes from parsed data', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{ id: '/root/src/index.js', dependencies: [], entities: [] }];
  const graph = buildGraph(data);
  assert.equal(graph.order, 1);
  assert(graph.hasNode('/root/src/index.js'));
});

test('creates class entity nodes with kind class', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/app.js', dependencies: [],
    entities: { classes: ['App'], functions: [], docstrings: [] },
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/app.js::App'));
  assert.equal(graph.getNodeAttributes('/root/src/app.js::App').kind, 'class');
});

test('creates function entity nodes with kind function', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/util.js', dependencies: [],
    entities: { classes: [], functions: ['format'], docstrings: [] },
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/util.js::format'));
  assert.equal(graph.getNodeAttributes('/root/src/util.js::format').kind, 'function');
});

test('creates method entity nodes with kind method', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/pool.js', dependencies: [],
    entities: { classes: [], functions: [], methods: ['run', '#drain'], docstrings: [] },
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/pool.js::run'));
  assert(graph.hasNode('/root/src/pool.js::#drain'));
  assert.equal(graph.getNodeAttributes('/root/src/pool.js::run').kind, 'method');
});

test('deduplicates entity names', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/app.js', dependencies: [],
    entities: { classes: ['App', 'App'], functions: [], docstrings: [] },
  }];
  const graph = buildGraph(data);
  let count = 0;
  graph.forEachNode((node) => { if (node.endsWith('::App')) count++; });
  assert.equal(count, 1);
});

test('handles legacy flat entity array format', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{ id: '/root/src/app.js', dependencies: [], entities: ['Helper'] }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/app.js::Helper'));
  assert.equal(graph.getNodeAttributes('/root/src/app.js::Helper').kind, 'entity');
});

test('resolves relative dependency ./', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [
    { id: '/root/src/index.js', dependencies: ['./util.js'], entities: [] },
    { id: '/root/src/util.js', dependencies: [], entities: [] },
  ];
  const graph = buildGraph(data);
  assert(graph.hasEdge('/root/src/index.js', '/root/src/util.js'));
});

test('resolves relative dependency ../', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [
    { id: '/root/src/index.js', dependencies: ['../lib/helper.js'], entities: [] },
    { id: '/root/lib/helper.js', dependencies: [], entities: [] },
  ];
  const graph = buildGraph(data);
  assert(graph.hasEdge('/root/src/index.js', '/root/lib/helper.js'));
});

test('marks unresolved non-relative deps as external packages', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/index.js', dependencies: ['express', 'lodash'], entities: [],
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('express'));
  assert(graph.hasNode('lodash'));
  assert.equal(graph.getNodeAttributes('express').external, true);
  assert(graph.hasEdge('/root/src/index.js', 'express'));
});

test('stores docstrings as file node attribute', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/app.js', dependencies: [],
    entities: { classes: [], functions: [], docstrings: ['Does something'] },
  }];
  const graph = buildGraph(data);
  const attrs = graph.getNodeAttributes('/root/src/app.js');
  assert.deepEqual(attrs.docstrings, ['Does something']);
});

test('backslash relative paths do not become external packages', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/index.js', dependencies: ['..\\other.js'], entities: [],
  }];
  const graph = buildGraph(data);
  assert(!graph.hasNode('..\\other.js'));
  let externals = 0;
  graph.forEachNode((node, attrs) => { if (attrs.external) externals++; });
  assert.equal(externals, 0);
});

test('external node has external: true and label', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/app.js', dependencies: ['react'], entities: [],
  }];
  const graph = buildGraph(data);
  const attrs = graph.getNodeAttributes('react');
  assert.equal(attrs.external, true);
  assert.equal(attrs.label, 'react');
});

test('handles null/undefined entities gracefully', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{ id: '/root/src/app.js', dependencies: [] }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/app.js'));
});

test('handles dependencies array with empty strings', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{ id: '/root/src/app.js', dependencies: [''], entities: [] }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/app.js'));
});

test('contains edge connects file to entity nodes', async () => {
  const { buildGraph } = await import('../../src/graph/builder.js');
  const data = [{
    id: '/root/src/app.js', dependencies: [],
    entities: { classes: ['App'], functions: ['doStuff'], docstrings: [] },
  }];
  const graph = buildGraph(data);
  assert(graph.hasEdge('/root/src/app.js', '/root/src/app.js::App'));
  assert(graph.hasEdge('/root/src/app.js', '/root/src/app.js::doStuff'));
  const edges = graph.edges('/root/src/app.js', '/root/src/app.js::App');
  assert.equal(edges.length, 1);
  const edgeAttrs = graph.getEdgeAttributes(edges[0]);
  assert.equal(edgeAttrs.relation, 'contains');
});
