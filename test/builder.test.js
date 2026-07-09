import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/graph/builder.js';

test('empty input returns empty graph', () => {
  const graph = buildGraph([]);
  assert.equal(graph.order, 0);
  assert.equal(graph.size, 0);
});

test('creates nodes for parsed files', () => {
  const data = [{
    id: '/root/src/index.js',
    dependencies: [],
    entities: [],
  }];
  const graph = buildGraph(data);
  assert.equal(graph.order, 1);
  assert(graph.hasNode('/root/src/index.js'));
});

test('creates entity nodes for classes', () => {
  const data = [{
    id: '/root/src/app.js',
    dependencies: [],
    entities: { classes: ['App'], functions: [], docstrings: [] },
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/app.js'));
  assert(graph.hasNode('/root/src/app.js::App'));
  assert.equal(graph.getNodeAttributes('/root/src/app.js::App').kind, 'class');
});

test('creates entity nodes for functions', () => {
  const data = [{
    id: '/root/src/util.js',
    dependencies: [],
    entities: { classes: [], functions: ['format'], docstrings: [] },
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/util.js::format'));
  assert.equal(graph.getNodeAttributes('/root/src/util.js::format').kind, 'function');
});

test('stores docstrings as node attribute', () => {
  const data = [{
    id: '/root/src/app.js',
    dependencies: [],
    entities: { classes: [], functions: [], docstrings: ['Does something'] },
  }];
  const graph = buildGraph(data);
  const attrs = graph.getNodeAttributes('/root/src/app.js');
  assert.deepEqual(attrs.docstrings, ['Does something']);
});

test('handles legacy flat entity array', () => {
  const data = [{
    id: '/root/src/app.js',
    dependencies: [],
    entities: ['Helper'],
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('/root/src/app.js::Helper'));
  assert.equal(graph.getNodeAttributes('/root/src/app.js::Helper').kind, 'entity');
});

test('resolves relative dependencies with ./', () => {
  const data = [
    { id: '/root/src/index.js', dependencies: ['./util.js'], entities: [] },
    { id: '/root/src/util.js', dependencies: [], entities: [] },
  ];
  const graph = buildGraph(data);
  assert(graph.hasEdge('/root/src/index.js', '/root/src/util.js'));
});

test('resolves relative dependencies with ../', () => {
  const data = [
    { id: '/root/src/index.js', dependencies: ['../lib/helper.js'], entities: [] },
    { id: '/root/lib/helper.js', dependencies: [], entities: [] },
  ];
  const graph = buildGraph(data);
  assert(graph.hasEdge('/root/src/index.js', '/root/lib/helper.js'));
});

test('marks unresolved non-relative deps as external packages', () => {
  const data = [{
    id: '/root/src/index.js',
    dependencies: ['express', 'lodash'],
    entities: [],
  }];
  const graph = buildGraph(data);
  assert(graph.hasNode('express'));
  assert(graph.hasNode('lodash'));
  assert.equal(graph.getNodeAttributes('express').external, true);
  assert(graph.hasEdge('/root/src/index.js', 'express'));
});

test('deduplicates entity names', () => {
  const data = [{
    id: '/root/src/app.js',
    dependencies: [],
    entities: { classes: ['App', 'App'], functions: [], docstrings: [] },
  }];
  const graph = buildGraph(data);
  let count = 0;
  graph.forEachNode((node) => {
    if (node.endsWith('::App')) count++;
  });
  assert.equal(count, 1);
});

test('backslash relative paths do not become external packages', () => {
  // On Linux, `\` is not a path separator, so `..\other.js` won't resolve
  // correctly. But it is correctly identified as a relative import (not
  // external), which is the cross-platform intent of the regex.
  const data = [{
    id: '/root/src/index.js',
    dependencies: ['..\\other.js'],
    entities: [],
  }];
  const graph = buildGraph(data);
  // Should NOT become an external package named "..\\other.js"
  assert(!graph.hasNode('..\\other.js'));
  // Should NOT become an external node — it was handled as relative
  const externals = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.external) externals.push(node);
  });
  assert.equal(externals.length, 0);
});
