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
  assert.equal(attrs.color, '#64748B');
});

test('enrichNodes preserves existing label when present', () => {
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { dependencies: [], label: 'CustomLabel' });
  enrichNodes(graph);
  const attrs = graph.getNodeAttributes('/root/src/app.js');
  assert.equal(attrs.label, 'CustomLabel');
});
