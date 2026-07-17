import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Graph from 'graphology';

let tmpDir;
let origCwd;

before(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-fmt-'));
  process.chdir(tmpDir);
});

after(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('exportGraphToJson writes valid JSON with nodes and edges', async () => {
  const { createOutDir } = await import('../../src/utils/file-system.js');
  const { exportGraphToJson } = await import('../../src/graph/formatter.js');
  const outDir = await createOutDir();
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  graph.addNode('/root/src/util.js', { dependencies: [] });
  graph.addEdge('/root/src/index.js', '/root/src/util.js', { relationship: 'imports' });
  const resultPath = await exportGraphToJson(graph, outDir);
  assert.equal(resultPath, path.join(outDir, 'graph.json'));
  const content = await fs.readFile(resultPath, 'utf-8');
  const parsed = JSON.parse(content);
  assert.ok(parsed.nodes);
  assert.ok(parsed.edges);
  assert.equal(parsed.nodes.length, 2);
  assert.equal(parsed.edges.length, 1);
});

test('exportGraphToJson preserves attributes', async () => {
  const { createOutDir } = await import('../../src/utils/file-system.js');
  const { exportGraphToJson } = await import('../../src/graph/formatter.js');
  const outDir = await createOutDir();
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('express', { external: true, label: 'express', npm: true });
  graph.addNode('/root/src/app.js', { dependencies: ['express'] });
  graph.addEdge('/root/src/app.js', 'express', { relationship: 'imports' });
  const resultPath = await exportGraphToJson(graph, outDir);
  const content = await fs.readFile(resultPath, 'utf-8');
  const parsed = JSON.parse(content);
  const expressNode = parsed.nodes.find(n => n.key === 'express');
  assert.ok(expressNode);
  assert.equal(expressNode.attributes.external, true);
  assert.equal(expressNode.attributes.npm, true);
  assert.equal(expressNode.attributes.label, 'express');
});

test('exportGraphToJson returns the correct file path', async () => {
  const { createOutDir } = await import('../../src/utils/file-system.js');
  const { exportGraphToJson } = await import('../../src/graph/formatter.js');
  const outDir = await createOutDir();
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/test.js', { dependencies: [] });
  const resultPath = await exportGraphToJson(graph, outDir);
  assert.ok(resultPath.endsWith('graph.json'));
  assert.ok(path.isAbsolute(resultPath));
});

test('exportGraphToJson writes graph with multi directed type', async () => {
  const { createOutDir } = await import('../../src/utils/file-system.js');
  const { exportGraphToJson } = await import('../../src/graph/formatter.js');
  const outDir = await createOutDir();
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/a.js', { dependencies: [] });
  graph.addNode('/b.js', { dependencies: [] });
  graph.addEdge('/a.js', '/b.js', { relationship: 'imports' });
  const resultPath = await exportGraphToJson(graph, outDir);
  const content = await fs.readFile(resultPath, 'utf-8');
  const parsed = JSON.parse(content);
  assert.equal(parsed.options.type, 'mixed');
  assert.equal(parsed.options.multi, true);
});
