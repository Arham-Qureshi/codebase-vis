import { test } from 'node:test';
import assert from 'node:assert/strict';
import Graph from 'graphology';

let computeGlobalStats, computeTargetStats;

test.before(async () => {
  const mod = await import('../../src/utils/stat-calculator.js');
  computeGlobalStats = mod.computeGlobalStats;
  computeTargetStats = mod.computeTargetStats;
});

function makeGraph() {
  const g = new Graph({ multi: true, directed: true });
  return g;
}

function addFileNode(g, id, opts = {}) {
  g.addNode(id, {
    label: opts.label || id.split('/').pop(),
    language: opts.language || 'JavaScript',
    community: opts.community || 'default',
    color: opts.color || '#4E79A7',
    dependencies: opts.dependencies || [],
  });
}

function addEntityNode(g, id, kind, label) {
  g.addNode(id, { label, kind });
}

function addExternalNode(g, id, npm = true) {
  g.addNode(id, { external: true, label: id, npm, community: 'dependencies', color: '#2d6a4f' });
}

function addDepEdge(g, from, to) {
  g.addEdge(from, to, { relationship: 'imports' });
}

function addContainsEdge(g, from, to) {
  g.addEdge(from, to, { relation: 'contains' });
}

test('empty graph returns zeros and no crash', () => {
  const stats = computeGlobalStats(makeGraph());
  assert.equal(stats.composition.fileNodes, 0);
  assert.equal(stats.composition.entityNodes, 0);
  assert.equal(stats.composition.externalPackages, 0);
  assert.equal(stats.composition.dependencyEdges, 0);
  assert.equal(stats.composition.containsEdges, 0);
  assert.equal(stats.composition.communities, 0);
  assert.equal(stats.languages.length, 0);
  assert.equal(stats.hotspots.mostImported.length, 0);
  assert.equal(stats.hotspots.heaviestImporters.length, 0);
  assert.equal(stats.hotspots.largestFiles.length, 0);
  assert.equal(stats.health.isolatedFiles, 0);
  assert.equal(stats.health.avgDepsPerFile, 0);
  assert.equal(stats.health.maxDepChain, 0);
  assert.equal(stats.health.circularDeps, null);
});

test('composition counts nodes and edges correctly', () => {
  const g = makeGraph();
  addFileNode(g, '/root/src/index.js');
  addFileNode(g, '/root/src/util.js');
  addEntityNode(g, '/root/src/index.js::Helper', 'class', 'Helper');
  addExternalNode(g, 'express');

  addDepEdge(g, '/root/src/index.js', '/root/src/util.js');
  addDepEdge(g, '/root/src/index.js', 'express');
  addContainsEdge(g, '/root/src/index.js', '/root/src/index.js::Helper');

  const stats = computeGlobalStats(g);
  const c = stats.composition;

  assert.equal(c.fileNodes, 2);
  assert.equal(c.entityNodes, 1);
  assert.deepEqual(c.entityBreakdown, { classes: 1, functions: 0, methods: 0 });
  assert.equal(c.externalPackages, 1);
  assert.equal(c.npmPackages, 1);
  assert.equal(c.dependencyEdges, 2);
  assert.equal(c.containsEdges, 1);
});

test('language breakdown aggregates per language', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js', { language: 'JavaScript' });
  addFileNode(g, '/root/b.js', { language: 'JavaScript' });
  addFileNode(g, '/root/c.ts', { language: 'TypeScript' });

  addDepEdge(g, '/root/a.js', '/root/b.js');
  addDepEdge(g, '/root/a.js', '/root/c.ts');

  addEntityNode(g, '/root/a.js::Foo', 'function', 'Foo');
  addContainsEdge(g, '/root/a.js', '/root/a.js::Foo');

  const stats = computeGlobalStats(g);
  const langs = stats.languages;

  assert.equal(langs.length, 2);

  const js = langs.find(l => l.language === 'JavaScript');
  assert.equal(js.files, 2);
  assert.equal(js.totalDeps, 2); // a.js → b.js + a.js → c.ts
  assert.equal(js.entities, 1);

  const ts = langs.find(l => l.language === 'TypeScript');
  assert.equal(ts.files, 1);
  assert.equal(ts.totalDeps, 0);
  assert.equal(ts.entities, 0);
});

test('languages sorted by file count descending', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.ts', { language: 'TypeScript' });
  addFileNode(g, '/root/b.ts', { language: 'TypeScript' });
  addFileNode(g, '/root/c.ts', { language: 'TypeScript' });
  addFileNode(g, '/root/d.js', { language: 'JavaScript' });
  addFileNode(g, '/root/e.py', { language: 'Python' });

  const stats = computeGlobalStats(g);
  const langs = stats.languages;
  assert.equal(langs[0].language, 'TypeScript');
  assert.equal(langs[0].files, 3);
  assert.equal(langs[1].language, 'JavaScript');
  assert.equal(langs[1].files, 1);
  assert.equal(langs[2].language, 'Python');
  assert.equal(langs[2].files, 1);
});

test('hotspots ranked by correct metric and limited by topN', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js', { label: 'a.js' });
  addFileNode(g, '/root/b.js', { label: 'b.js' });
  addFileNode(g, '/root/c.js', { label: 'c.js' });

  addDepEdge(g, '/root/a.js', '/root/b.js');
  addDepEdge(g, '/root/a.js', '/root/c.js');
  addDepEdge(g, '/root/b.js', '/root/c.js');

  addEntityNode(g, '/root/a.js::X', 'class', 'X');
  addContainsEdge(g, '/root/a.js', '/root/a.js::X');
  addEntityNode(g, '/root/a.js::Y', 'function', 'Y');
  addContainsEdge(g, '/root/a.js', '/root/a.js::Y');

  const stats = computeGlobalStats(g, { topN: 2 });

  // Most imported: c.js (2 dependents), b.js (1 dependent)
  assert.equal(stats.hotspots.mostImported.length, 2);
  assert.equal(stats.hotspots.mostImported[0].label, 'c.js');
  assert.equal(stats.hotspots.mostImported[0].dependents, 2);
  assert.equal(stats.hotspots.mostImported[1].label, 'b.js');
  assert.equal(stats.hotspots.mostImported[1].dependents, 1);

  // Heaviest importers: a.js (2 deps), b.js (1 dep)
  assert.equal(stats.hotspots.heaviestImporters.length, 2);
  assert.equal(stats.hotspots.heaviestImporters[0].label, 'a.js');
  assert.equal(stats.hotspots.heaviestImporters[0].dependencies, 2);
  assert.equal(stats.hotspots.heaviestImporters[1].label, 'b.js');
  assert.equal(stats.hotspots.heaviestImporters[1].dependencies, 1);

  // Largest files: a.js (2 entities)
  assert.equal(stats.hotspots.largestFiles.length, 1);
  assert.equal(stats.hotspots.largestFiles[0].label, 'a.js');
  assert.equal(stats.hotspots.largestFiles[0].entities, 2);
});

test('topN clips hotspot lists', () => {
  const g = makeGraph();
  for (let i = 0; i < 10; i++) {
    addFileNode(g, `/root/file${i}.js`, { label: `file${i}.js` });
  }
  addDepEdge(g, '/root/file0.js', '/root/file1.js');
  addDepEdge(g, '/root/file2.js', '/root/file1.js');

  const stats1 = computeGlobalStats(g, { topN: 1 });
  assert.equal(stats1.hotspots.mostImported.length, 1);

  const stats10 = computeGlobalStats(g, { topN: 10 });
  assert.equal(stats10.hotspots.mostImported.length, 1); // only 1 has in-degree>0
});

test('isolated files detected', () => {
  const g = makeGraph();
  addFileNode(g, '/root/connected.js');
  addFileNode(g, '/root/isolated.js');

  addDepEdge(g, '/root/connected.js', '/root/connected.js'); // self-loop doesn't count as isolated

  const stats = computeGlobalStats(g);
  assert.equal(stats.health.isolatedFiles, 1);
});

test('maxDepChain computed from root files', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js');
  addFileNode(g, '/root/b.js');
  addFileNode(g, '/root/c.js');
  addFileNode(g, '/root/d.js');

  addDepEdge(g, '/root/a.js', '/root/b.js'); // a → b → c → d
  addDepEdge(g, '/root/b.js', '/root/c.js');
  addDepEdge(g, '/root/c.js', '/root/d.js');

  const stats = computeGlobalStats(g);
  assert.equal(stats.health.maxDepChain, 3); // 3 hops: a→b, b→c, c→d
});

test('maxDepChain zero for graph with no edges', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js');
  addFileNode(g, '/root/b.js');

  const stats = computeGlobalStats(g);
  assert.equal(stats.health.maxDepChain, 0);
});

test('cross-module edges detected', () => {
  const g = makeGraph();
  addFileNode(g, '/root/src/a.js', { community: 'module-a' });
  addFileNode(g, '/root/src/b.js', { community: 'module-a' });
  addFileNode(g, '/root/src/c.js', { community: 'module-b' });

  addDepEdge(g, '/root/src/a.js', '/root/src/b.js'); // same module
  addDepEdge(g, '/root/src/a.js', '/root/src/c.js'); // cross-module
  addDepEdge(g, '/root/src/c.js', '/root/src/a.js'); // cross-module

  // Add external that shouldn't affect cross-module count
  addExternalNode(g, 'lodash');
  addDepEdge(g, '/root/src/a.js', 'lodash');

  const stats = computeGlobalStats(g);
  assert.equal(stats.composition.crossCommunityEdges, 2); // a→c, c→a
  assert.equal(stats.composition.totalFileToFileEdges, 3); // a→b, a→c, c→a
  assert.equal(stats.composition.crossCommunityPct, parseFloat((2 / 3 * 100).toFixed(1)));
});

test('cycles cross-reference in global stats', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js');
  addFileNode(g, '/root/b.js');

  const cycles = [
    { id: 1, files: [{ id: '/root/a.js' }, { id: '/root/b.js' }] },
  ];

  const stats1 = computeGlobalStats(g, { cycles });
  assert.equal(stats1.health.circularDeps, 1);

  const stats2 = computeGlobalStats(g, { cycles: [] });
  assert.equal(stats2.health.circularDeps, 0);

  const stats3 = computeGlobalStats(g);
  assert.equal(stats3.health.circularDeps, null);
});

test('cycles cross-reference in target stats', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js');
  addFileNode(g, '/root/b.js');
  addFileNode(g, '/root/c.js');

  const cycles = [
    { id: 1, files: [{ id: '/root/a.js' }, { id: '/root/b.js' }] },
    { id: 2, files: [{ id: '/root/a.js' }, { id: '/root/c.js' }] },
  ];

  const a = computeTargetStats(g, '/root/a.js', { cycles });
  assert.deepEqual(a.cycles, [1, 2]);

  const b = computeTargetStats(g, '/root/b.js', { cycles });
  assert.deepEqual(b.cycles, [1]);

  const c = computeTargetStats(g, '/root/c.js', { cycles });
  assert.deepEqual(c.cycles, [2]);

  const noCycles = computeTargetStats(g, '/root/a.js');
  assert.deepEqual(noCycles.cycles, []);
});

test('target stats for file node', () => {
  const g = makeGraph();
  addFileNode(g, '/root/src/app.js', { language: 'JavaScript', community: 'src' });
  addFileNode(g, '/root/src/util.js');
  addEntityNode(g, '/root/src/app.js::App', 'class', 'App');
  addEntityNode(g, '/root/src/app.js::run', 'function', 'run');
  addExternalNode(g, 'lodash');

  addDepEdge(g, '/root/src/app.js', '/root/src/util.js');
  addDepEdge(g, '/root/src/app.js', 'lodash');
  addContainsEdge(g, '/root/src/app.js', '/root/src/app.js::App');
  addContainsEdge(g, '/root/src/app.js', '/root/src/app.js::run');

  const ts = computeTargetStats(g, '/root/src/app.js');

  assert.equal(ts.type, 'file');
  assert.equal(ts.language, 'JavaScript');
  assert.equal(ts.community, 'src');
  assert.equal(ts.degree.out, 4);
  assert.equal(ts.degree.in, 0);
  assert.equal(ts.dependencies, 2); // util.js + lodash (not entities)
  assert.equal(ts.dependents, 0);
  assert.deepEqual(ts.entities, { classes: 1, functions: 1, methods: 0, total: 2 });
  assert.equal(ts.isIsolated, false);
});

test('target stats for entity node', () => {
  const g = makeGraph();
  addFileNode(g, '/root/src/app.js', { language: 'JavaScript', community: 'components' });
  addEntityNode(g, '/root/src/app.js::MyClass', 'class', 'MyClass');
  addContainsEdge(g, '/root/src/app.js', '/root/src/app.js::MyClass');

  const ts = computeTargetStats(g, '/root/src/app.js::MyClass');

  assert.equal(ts.type, 'entity');
  assert.equal(ts.kind, 'class');
  assert.equal(ts.label, 'MyClass');
  assert.equal(ts.parentFile, '/root/src/app.js');
  assert.equal(ts.language, 'JavaScript');
  assert.equal(ts.community, 'components'); // inherited
  assert.equal(ts.degree.in, 1);
  assert.equal(ts.degree.out, 0);
  assert.equal(ts.dependents, 1);
  assert.equal(ts.isIsolated, false);
});

test('target stats for external package node', () => {
  const g = makeGraph();
  addFileNode(g, '/root/src/app.js');
  addExternalNode(g, 'express', true);

  addDepEdge(g, '/root/src/app.js', 'express');

  const ts = computeTargetStats(g, 'express');

  assert.equal(ts.type, 'external');
  assert.equal(ts.npm, true);
  assert.equal(ts.language, null);
  assert.equal(ts.community, 'dependencies');
  assert.equal(ts.degree.in, 1);
  assert.equal(ts.degree.out, 0);
  assert.equal(ts.dependents, 1);
  assert.equal(ts.dependencies, 0);
  assert.equal(ts.entities, undefined);
});

test('verbose mode includes isolatedList and entityList', () => {
  const g = makeGraph();
  addFileNode(g, '/root/isolated.js');
  addFileNode(g, '/root/connected.js');
  addEntityNode(g, '/root/connected.js::Foo', 'function', 'Foo');
  addContainsEdge(g, '/root/connected.js', '/root/connected.js::Foo');
  addDepEdge(g, '/root/connected.js', '/root/connected.js'); // self-loop so not isolated

  const globalStats = computeGlobalStats(g, { verbose: true });
  assert.ok(Array.isArray(globalStats.health.isolatedList));
  assert.equal(globalStats.health.isolatedList.length, 1);
  assert.equal(globalStats.health.isolatedList[0], '/root/isolated.js');

  const targetStats = computeTargetStats(g, '/root/connected.js', { verbose: true });
  assert.ok(Array.isArray(targetStats.entityList));
  assert.equal(targetStats.entityList.length, 1);
  assert.equal(targetStats.entityList[0].name, 'Foo');
});

test('directories breakdown counts files per directory', () => {
  const g = makeGraph();
  addFileNode(g, '/root/src/a.js');
  addFileNode(g, '/root/src/b.js');
  addFileNode(g, '/root/lib/c.js');

  const stats = computeGlobalStats(g);
  assert.equal(stats.composition.directories, 2);
  assert.equal(stats.directories.length, 2);
  assert.equal(stats.directories[0].dir, '/root/src');
  assert.equal(stats.directories[0].files, 2);
  assert.equal(stats.directories[1].dir, '/root/lib');
  assert.equal(stats.directories[1].files, 1);
});

test('computeTargetStats returns null for non-existent node', () => {
  const g = makeGraph();
  addFileNode(g, '/root/exists.js');
  const ts = computeTargetStats(g, '/root/nope.js');
  assert.equal(ts, null);
});

test('entity breakdown excludes non-file nodes from language counts', () => {
  const g = makeGraph();
  addFileNode(g, '/root/app.py', { language: 'Python' });
  addExternalNode(g, 'flask');
  addDepEdge(g, '/root/app.py', 'flask');

  const stats = computeGlobalStats(g);
  const py = stats.languages.find(l => l.language === 'Python');
  assert.equal(py.files, 1);
  assert.equal(py.totalDeps, 1); // flask
});

test('avgDepsPerFile counts only non-entity out-neighbors', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js');
  addFileNode(g, '/root/b.js');
  addEntityNode(g, '/root/a.js::X', 'class', 'X');
  addContainsEdge(g, '/root/a.js', '/root/a.js::X');
  addDepEdge(g, '/root/a.js', '/root/b.js');
  addDepEdge(g, '/root/a.js', '/root/b.js'); // parallel edge

  const stats = computeGlobalStats(g);
  // a.js has 2 parallel edges to b.js, 0 from b.js, so totalDeps = 2
  // but avgDepsPerFile should count unique deps... hmm
  assert.equal(stats.health.avgDepsPerFile, 0.5); // 1 dep / 2 files
});

test('hotspots exclude entity out-neighbors from dependency count', () => {
  const g = makeGraph();
  addFileNode(g, '/root/a.js', { label: 'a.js' });
  addEntityNode(g, '/root/a.js::Foo', 'function', 'Foo');
  addEntityNode(g, '/root/a.js::Bar', 'class', 'Bar');
  addContainsEdge(g, '/root/a.js', '/root/a.js::Foo');
  addContainsEdge(g, '/root/a.js', '/root/a.js::Bar');

  const stats = computeGlobalStats(g, { topN: 5 });
  assert.equal(stats.hotspots.heaviestImporters.length, 0); // 0 real deps
  assert.equal(stats.hotspots.largestFiles.length, 1);
  assert.equal(stats.hotspots.largestFiles[0].entities, 2);
});