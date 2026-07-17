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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-shared-'));
  process.chdir(tmpDir);
});

after(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('toRelative returns relative path from process.cwd()', async () => {
  const { toRelative } = await import('../../src/cli/shared.js');
  const abs = path.join(process.cwd(), 'src', 'file.js');
  const rel = toRelative(abs);
  assert.equal(rel, path.join('src', 'file.js'));
});

test('toRelative falls back to nodeId when relative is empty', async () => {
  const { toRelative } = await import('../../src/cli/shared.js');
  assert.equal(toRelative(process.cwd()), process.cwd());
});

test('loadGraph returns null when graph.json does not exist', async () => {
  const { loadGraph } = await import('../../src/cli/shared.js');
  const graph = await loadGraph();
  assert.equal(graph, null);
});

test('loadGraph returns loaded graph when graph.json exists', async () => {
  const { loadGraph } = await import('../../src/cli/shared.js');
  const outDir = path.join(process.cwd(), 'codebase-out');
  await fs.mkdir(outDir, { recursive: true });
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/index.js', { dependencies: [] });
  graph.addNode('/root/src/util.js', { dependencies: [] });
  graph.addEdge('/root/src/index.js', '/root/src/util.js', { relationship: 'imports' });
  await fs.writeFile(path.join(outDir, 'graph.json'), JSON.stringify(graph.export()), 'utf-8');
  const loaded = await loadGraph();
  assert.ok(loaded);
  assert.equal(loaded.order, 2);
  assert.equal(loaded.size, 1);
});

test('loadGraph throws on corrupted graph.json', async () => {
  const { loadGraph } = await import('../../src/cli/shared.js');
  const outDir = path.join(process.cwd(), 'codebase-out');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'graph.json'), 'not-json', 'utf-8');
  await assert.rejects(() => loadGraph());
});

test('resolveNode finds exact match first', async () => {
  const { resolveNode } = await import('../../src/cli/shared.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { label: 'app.js' });
  graph.addNode('/root/src/app2.js', { label: 'app2.js' });
  const result = await resolveNode(graph, '/root/src/app.js');
  assert.equal(result, '/root/src/app.js');
});

test('resolveNode resolves relative path to absolute', async () => {
  const { resolveNode } = await import('../../src/cli/shared.js');
  const graph = new Graph({ multi: true, directed: true });
  const absPath = path.resolve('src/index.js');
  graph.addNode(absPath, { label: 'index.js' });
  const result = await resolveNode(graph, 'src/index.js');
  assert.equal(result, absPath);
});

test('resolveNode returns null for no match', async () => {
  const { resolveNode } = await import('../../src/cli/shared.js');
  const graph = new Graph({ multi: true, directed: true });
  graph.addNode('/root/src/app.js', { label: 'app.js' });
  const result = await resolveNode(graph, 'nonexistent');
  assert.equal(result, null);
});
