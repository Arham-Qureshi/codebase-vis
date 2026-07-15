import { test } from 'node:test';
import assert from 'node:assert/strict';
import Graph from 'graphology';

test('findCommonRoot returns empty string for empty input', async () => {
  const { findCommonRoot } = await import('../../src/graph/enricher.js');
  assert.equal(findCommonRoot([]), '');
});

test('findCommonRoot returns path for single directory', async () => {
  const { findCommonRoot } = await import('../../src/graph/enricher.js');
  assert.equal(findCommonRoot(['/a/b']), '/a/b');
});

test('findCommonRoot finds common root for sibling paths', async () => {
  const { findCommonRoot } = await import('../../src/graph/enricher.js');
  const result = findCommonRoot(['/a/b/c.js', '/a/b/d.js', '/a/b/e/f.js']);
  assert.ok(result.startsWith('/a/b') || result === '/a/b');
});

test('findCommonRoot returns filesystem root when no common directory', async () => {
  const { findCommonRoot } = await import('../../src/graph/enricher.js');
  assert.equal(findCommonRoot(['/a', '/b']), '/');
});

test('enrichNodes sets x and y coordinates', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/index.js');
  assert.ok(typeof attrs.x === 'number');
  assert.ok(typeof attrs.y === 'number');
});

test('enrichNodes sets size proportional to degree clamped 5-15', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  graph.addNode('/root/src/util.js', { dependencies: [] });
  graph.addEdge('/root/src/index.js', '/root/src/util.js', { relationship: 'imports' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/index.js');
  assert.ok(attrs.size >= 5);
  assert.ok(attrs.size <= 15);
});

test('enrichNodes sets label from path basename when no label exists', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('/root/src/index.js').label, 'index.js');
});

test('enrichNodes preserves existing label attribute', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [], label: 'CustomLabel' });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('/root/src/app.js').label, 'CustomLabel');
});

test('enrichNodes sets language for known file extensions', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.ts', { dependencies: [] });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('/root/src/app.ts').language, 'TypeScript');
});

test('enrichNodes sets language to Unknown for unknown extensions', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/file.xyz', { dependencies: [] });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('/root/src/file.xyz').language, 'Unknown');
});

test('external nodes get community dependencies and green color', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('express', { external: true, label: 'express' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('express');
  assert.equal(attrs.community, 'dependencies');
  assert.equal(attrs.color, '#2d6a4f');
});

test('npm flag preserved on external nodes', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('lodash', { external: true, label: 'lodash', npm: true });
  graph.addNode('fs', { external: true, label: 'fs', npm: false });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('lodash').color, '#2d6a4f');
  assert.equal(graph.getNodeAttributes('fs').color, '#2d6a4f');
});

test('entity nodes get size 3 and purple color', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
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
  for (const node of ['/root/src/app.js::App', '/root/src/app.js::run', '/root/src/app.js::transform', '/root/src/app.js::Helper']) {
    assert.equal(graph.getNodeAttributes(node).size, 3);
    assert.equal(graph.getNodeAttributes(node).color, '#6a2d6a');
  }
});

test('entity nodes inherit community from parent file', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [] });
  graph.addNode('/root/src/app.js::App', { label: 'App', kind: 'class' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::App', { relation: 'contains' });
  enrichNodes(graph);
  const parentAttrs = graph.getNodeAttributes('/root/src/app.js');
  const entityAttrs = graph.getNodeAttributes('/root/src/app.js::App');
  assert.equal(entityAttrs.community, parentAttrs.community);
});

test('file nodes get community name and palette color', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: ['./util.js'] });
  graph.addNode('/root/src/util.js', { dependencies: [] });
  graph.addEdge('/root/src/index.js', '/root/src/util.js', { relationship: 'imports' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/index.js');
  assert.ok(typeof attrs.community === 'string' && attrs.community.length > 0);
  assert.ok(attrs.color.startsWith('#'));
  assert.notEqual(attrs.color, '#6a2d6a');
  assert.notEqual(attrs.color, '#2d6a4f');
});

test('singleton file with no edges gets a community', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/isolated.js', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/isolated.js');
  assert.ok(typeof attrs.community === 'string' && attrs.community.length > 0);
  assert.ok(attrs.color.startsWith('#'));
  assert.equal(attrs.language, 'JavaScript');
});

test('communities disambiguated with #1, #2 suffixes', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/foo/src/a.js', { dependencies: ['./b.js'] });
  graph.addNode('/root/foo/src/b.js', { dependencies: [] });
  graph.addNode('/root/bar/c.js', { dependencies: [] });
  graph.addEdge('/root/foo/src/a.js', '/root/foo/src/b.js', { relationship: 'imports' });
  graph.addEdge('/root/foo/src/a.js', '/root/bar/c.js', { relationship: 'imports' });
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
  assert.equal(disambiguated.length, 2);
  assert.ok(communityNames.has('foo/src #1'));
  assert.ok(communityNames.has('foo/src #2'));
});

test('empty graph does not throw', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  enrichNodes(graph);
  assert.equal(graph.order, 0);
});

test('graph with only external nodes does not throw', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('express', { external: true, label: 'express' });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('express').community, 'dependencies');
});

test('graph with only entity nodes does not throw', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [] });
  graph.addNode('/root/src/app.js::App', { label: 'App', kind: 'class' });
  graph.addEdge('/root/src/app.js', '/root/src/app.js::App', { relation: 'contains' });
  enrichNodes(graph);
  assert.equal(graph.getNodeAttributes('/root/src/app.js::App').size, 3);
});

test('isolated nodes get community and palette color', async () => {
  const { enrichNodes } = await import('../../src/graph/enricher.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/deep/nested/solo.js', { dependencies: [] });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/deep/nested/solo.js');
  assert.ok(typeof attrs.community === 'string' && attrs.community.length > 0);
  assert.ok(attrs.color.startsWith('#'));
  assert.ok(attrs.color !== '#6a2d6a');
  assert.ok(attrs.color !== '#2d6a4f');
});
