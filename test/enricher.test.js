import { test } from 'node:test';
import assert from 'node:assert/strict';
import Graph from 'graphology';
import { enrichNodes, findCommonRoot } from '../src/graph/enricher.js';

test('findCommonRoot returns empty string for empty input', () => {
  assert.equal(findCommonRoot([]), '');
});

test('findCommonRoot returns root for single directory path', () => {
  const result = findCommonRoot(['/a/b']);
  assert.equal(result, '/a/b');
});

test('findCommonRoot finds common root for directory paths', () => {
  const result = findCommonRoot(['/a/b/c.js', '/a/b/d.js', '/a/b/e/f.js']);
  assert.ok(result.startsWith('/a/b') || result === '/a/b');
});

test('findCommonRoot returns filesystem root when no common directory', () => {
  const result = findCommonRoot(['/a', '/b']);
  assert.equal(result, '/');
});

test('enrichNodes sets x and y coordinates', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/index.js');
  assert.ok(typeof attrs.x === 'number');
  assert.ok(typeof attrs.y === 'number');
});

test('enrichNodes sets size proportional to degree', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  graph.addNode('/root/src/util.js', { dependencies: [] });
  graph.addEdge('/root/src/index.js', '/root/src/util.js', { relationship: 'imports' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/index.js');
  assert.ok(attrs.size >= 5);
});

test('enrichNodes sets label from path basename when no label exists', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/index.js');
  assert.equal(attrs.label, 'index.js');
});

test('enrichNodes sets language for known extensions', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.ts', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/app.ts');
  assert.equal(attrs.language, 'TypeScript');
});

test('enrichNodes sets language to Unknown for unknown extensions', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/file.xyz', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/file.xyz');
  assert.equal(attrs.language, 'Unknown');
});

test('enrichNodes assigns external color and community to external nodes', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('express', { external: true, label: 'express' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('express');
  assert.equal(attrs.community, 'dependencies');
  assert.equal(attrs.color, '#2d6a4f');
});

test('enrichNodes preserves existing label when present', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [], label: 'CustomLabel' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/app.js');
  assert.equal(attrs.label, 'CustomLabel');
});

test('enrichNodes assigns maroon color to all entity kinds', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [] });
  graph.addNode('/root/src/app.js::App', { label: 'App', kind: 'class' });
  graph.addNode('/root/src/app.js::run', { label: 'run', kind: 'method' });
  graph.addNode('/root/src/app.js::transform', { label: 'transform', kind: 'function' });
  graph.addNode('/root/src/app.js::Helper', { label: 'Helper', kind: 'entity' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::App', { relation: 'contains' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::run', { relation: 'contains' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::transform', { relation: 'contains' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::Helper', { relation: 'contains' });
  enrichNodes(graph);
  for (const kind of ['class', 'method', 'function', 'entity']) {
    const nodeId = kind === 'class' ? '/root/src/app.js::App'
      : kind === 'method' ? '/root/src/app.js::run'
      : kind === 'function' ? '/root/src/app.js::transform'
      : '/root/src/app.js::Helper';
    const attrs = graph.getNodeAttributes(nodeId);
    assert.equal(attrs.color, '#6a2d6a', `entity kind "${kind}" should be maroon`);
  }
});

test('enrichNodes entity inherits community from parent file', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [] });
  graph.addNode('/root/src/app.js::App', { label: 'App', kind: 'class' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::App', { relation: 'contains' });
  enrichNodes(graph);
  const parentAttrs = graph.getNodeAttributes('/root/src/app.js');
  const entityAttrs = graph.getNodeAttributes('/root/src/app.js::App');
  assert.equal(entityAttrs.community, parentAttrs.community);
});

test('enrichNodes sets size 3 for entity nodes', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [] });
  graph.addNode('/root/src/app.js::App', { label: 'App', kind: 'class' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::App', { relation: 'contains' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/app.js::App');
  assert.equal(attrs.size, 3);
});

test('enrichNodes assigns community and palette color to file nodes', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: ['./util.js'] });
  graph.addNode('/root/src/util.js', { dependencies: [] });
  graph.addEdge('/root/src/index.js', '/root/src/util.js', { relationship: 'imports' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/index.js');
  assert.ok(typeof attrs.community === 'string' && attrs.community.length > 0, 'file node should have a community name');
  assert.ok(attrs.color.startsWith('#'), 'file node should have a hex color');
  assert.notEqual(attrs.color, '#6a2d6a', 'file node should not use entity color');
  assert.notEqual(attrs.color, '#2d6a4f', 'file node should not use external color');
});

test('enrichNodes marks npm packages with npm flag', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('lodash', { external: true, label: 'lodash', npm: true });
  graph.addNode('fs', { external: true, label: 'fs', npm: false });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('lodash').color, '#2d6a4f');
  assert.equal(graph.getNodeAttributes('lodash').community, 'dependencies');
  assert.equal(graph.getNodeAttributes('fs').color, '#2d6a4f');
  assert.equal(graph.getNodeAttributes('fs').community, 'dependencies');
});

test('enrichNodes assigns community and language to a singleton node with no edges', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/isolated.js', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/isolated.js');
  assert.ok(typeof attrs.community === 'string' && attrs.community.length > 0);
  assert.ok(attrs.color.startsWith('#'));
  assert.equal(attrs.language, 'JavaScript');
});

test('enrichNodes disambiguates communities sharing the same directory name', () => {
  const graph = new Graph({ multi: true, directed: true });

  // Community A — mostly in foo/src, one outlier in bar
  graph.addNode('/root/foo/src/a.js', { dependencies: ['./b.js'] });
  graph.addNode('/root/foo/src/b.js', { dependencies: [] });
  graph.addNode('/root/bar/c.js', { dependencies: [] });
  graph.addEdge('/root/foo/src/a.js', '/root/foo/src/b.js', { relationship: 'imports' });
  graph.addEdge('/root/foo/src/a.js', '/root/bar/c.js', { relationship: 'imports' });

  // Community B — mostly in foo/src, one outlier in baz
  graph.addNode('/root/foo/src/d.js', { dependencies: ['./e.js'] });
  graph.addNode('/root/foo/src/e.js', { dependencies: [] });
  graph.addNode('/root/baz/f.js', { dependencies: [] });
  graph.addEdge('/root/foo/src/d.js', '/root/foo/src/e.js', { relationship: 'imports' });
  graph.addEdge('/root/foo/src/d.js', '/root/baz/f.js', { relationship: 'imports' });

  enrichNodes(graph);

  const communityNames = new Set();
  graph.forEachNode((node, attrs) => {
    if (!attrs.external && !['entity', 'class', 'function', 'method'].includes(attrs.kind)) {
      communityNames.add(attrs.community);
    }
  });

  const disambiguated = [...communityNames].filter(n => n.startsWith('foo/src'));
  assert.equal(disambiguated.length, 2, 'should produce two disambiguated names');
  assert.ok(communityNames.has('foo/src #1'), 'should have foo/src #1');
  assert.ok(communityNames.has('foo/src #2'), 'should have foo/src #2');
});
