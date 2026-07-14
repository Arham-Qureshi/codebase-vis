import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir;
let origCwd;

before(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-vis-cache-test-'));
  process.chdir(tmpDir);
});

after(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('loadCache returns null when no cache file exists', async () => {
  const { loadCache } = await import('../src/utils/cache.js');
  const result = await loadCache(tmpDir);
  assert.equal(result, null);
});

test('loadCache returns null for corrupted JSON', async () => {
  const { loadCache } = await import('../src/utils/cache.js');
  await fs.writeFile(path.join(tmpDir, '.cache.json'), 'not-json', 'utf-8');
  const result = await loadCache(tmpDir);
  assert.equal(result, null);
});

test('loadCache returns null for wrong version', async () => {
  const { loadCache } = await import('../src/utils/cache.js');
  await fs.writeFile(path.join(tmpDir, '.cache.json'), JSON.stringify({ version: 99, files: {} }), 'utf-8');
  const result = await loadCache(tmpDir);
  assert.equal(result, null);
});

test('loadCache returns files for valid cache', async () => {
  const { loadCache } = await import('../src/utils/cache.js');
  const files = { '/a.js': { mtime: 100, size: 10, data: { id: '/a.js', dependencies: [] } } };
  await fs.writeFile(path.join(tmpDir, '.cache.json'), JSON.stringify({ version: 1, files }), 'utf-8');
  const result = await loadCache(tmpDir);
  assert.deepEqual(result, files);
});

test('saveCache writes valid cache file', async () => {
  const { saveCache, loadCache } = await import('../src/utils/cache.js');
  const files = { '/b.js': { mtime: 200, size: 20, data: { id: '/b.js', dependencies: ['x'] } } };
  await saveCache(tmpDir, files);
  const reloaded = await loadCache(tmpDir);
  assert.deepEqual(reloaded, files);
});

test('splitFilesByCache returns all toParse when cache is empty', async () => {
  const { splitFilesByCache } = await import('../src/utils/cache.js');
  const files = ['/a.js', '/b.js'];
  const result = await splitFilesByCache(files, {});
  assert.equal(result.toParse.length, 2);
  assert.equal(result.cachedResults.length, 0);
});

test('splitFilesByCache returns cached when mtime and size match', async () => {
  const { splitFilesByCache } = await import('../src/utils/cache.js');
  const filePath = path.join(tmpDir, 'match.js');
  await fs.writeFile(filePath, 'const x = 1;', 'utf-8');
  const stat = await fs.stat(filePath);
  const cache = {
    [filePath]: { mtime: stat.mtimeMs, size: stat.size, data: { id: filePath, dependencies: ['y'] } },
  };
  const result = await splitFilesByCache([filePath], cache);
  assert.equal(result.toParse.length, 0);
  assert.equal(result.cachedResults.length, 1);
  assert.deepEqual(result.cachedResults[0], { id: filePath, dependencies: ['y'] });
});

test('splitFilesByCache returns toParse when mtime changed', async () => {
  const { splitFilesByCache } = await import('../src/utils/cache.js');
  const filePath = path.join(tmpDir, 'changed.js');
  await fs.writeFile(filePath, 'old', 'utf-8');
  const oldStat = await fs.stat(filePath);
  const cache = {
    [filePath]: { mtime: oldStat.mtimeMs - 10000, size: oldStat.size, data: { id: filePath, dependencies: [] } },
  };
  await fs.writeFile(filePath, 'const x = 2;', 'utf-8');
  const result = await splitFilesByCache([filePath], cache);
  assert.equal(result.toParse.length, 1);
  assert.equal(result.cachedResults.length, 0);
});

test('splitFilesByCache returns toParse when size changed', async () => {
  const { splitFilesByCache } = await import('../src/utils/cache.js');
  const filePath = path.join(tmpDir, 'size-changed.js');
  await fs.writeFile(filePath, 'small', 'utf-8');
  const oldStat = await fs.stat(filePath);
  const cache = {
    [filePath]: { mtime: oldStat.mtimeMs, size: 1, data: { id: filePath, dependencies: [] } },
  };
  const result = await splitFilesByCache([filePath], cache);
  assert.equal(result.toParse.length, 1);
  assert.equal(result.cachedResults.length, 0);
});

test('getStalePaths returns paths missing from discovered set', async () => {
  const { getStalePaths } = await import('../src/utils/cache.js');
  const cache = {
    '/gone.js': { mtime: 1, size: 1, data: null },
    '/still-here.js': { mtime: 2, size: 2, data: null },
  };
  const discoveredSet = new Set(['/still-here.js']);
  const stale = getStalePaths(cache, discoveredSet);
  assert.deepEqual(stale, ['/gone.js']);
});

test('buildUpdatedCache removes stale paths', async () => {
  const { buildUpdatedCache } = await import('../src/utils/cache.js');
  const oldCache = {
    '/stale.js': { mtime: 1, size: 1, data: { id: '/stale.js', dependencies: [] } },
    '/keep.js': { mtime: 2, size: 2, data: { id: '/keep.js', dependencies: [] } },
  };
  const updated = await buildUpdatedCache(oldCache, [], [], ['/stale.js']);
  assert.equal(updated['/stale.js'], undefined);
  assert.ok(updated['/keep.js']);
});

test('buildUpdatedCache adds new parsed files with mtime and size', async () => {
  const { buildUpdatedCache } = await import('../src/utils/cache.js');
  const filePath = path.join(tmpDir, 'new-file.js');
  await fs.writeFile(filePath, 'const a = 1;', 'utf-8');
  const stat = await fs.stat(filePath);
  const result = { id: filePath, dependencies: ['z'], entities: { classes: [], functions: [] } };
  const updated = await buildUpdatedCache({}, [filePath], [result], []);
  const entry = updated[filePath];
  assert.ok(entry);
  assert.equal(entry.mtime, stat.mtimeMs);
  assert.equal(entry.size, stat.size);
  assert.deepEqual(entry.data, result);
});

test('buildUpdatedCache keeps existing cache entries unchanged', async () => {
  const { buildUpdatedCache } = await import('../src/utils/cache.js');
  const oldCache = {
    '/unchanged.js': { mtime: 10, size: 10, data: { id: '/unchanged.js', dependencies: [] } },
  };
  const updated = await buildUpdatedCache(oldCache, [], [], []);
  assert.deepEqual(updated['/unchanged.js'], oldCache['/unchanged.js']);
});

test('incremental: full cycle — save, load, split, rebuild', async () => {
  const { saveCache, loadCache, splitFilesByCache, buildUpdatedCache } = await import('../src/utils/cache.js');

  const filePath = path.join(tmpDir, 'cycle.js');
  await fs.writeFile(filePath, 'const x = 1;', 'utf-8');
  const stat = await fs.stat(filePath);
  const parsed = { id: filePath, dependencies: ['lodash'], entities: { classes: [], functions: [] } };

  // Save initial cache
  const initial = { [filePath]: { mtime: stat.mtimeMs, size: stat.size, data: parsed } };
  await saveCache(tmpDir, initial);

  // Load it back
  const loaded = await loadCache(tmpDir);
  assert.deepEqual(loaded, initial);

  // Split — should all be cached (unchanged)
  const split1 = await splitFilesByCache([filePath], loaded);
  assert.equal(split1.toParse.length, 0);
  assert.equal(split1.cachedResults.length, 1);
  assert.deepEqual(split1.cachedResults[0], parsed);

  // Modify the file
  await fs.writeFile(filePath, 'const y = 2;', 'utf-8');

  // Split again — should need re-parse now
  const split2 = await splitFilesByCache([filePath], loaded);
  assert.equal(split2.toParse.length, 1);
  assert.equal(split2.cachedResults.length, 0);

  // Rebuild cache with new stat
  const newStat = await fs.stat(filePath);
  const newParsed = { id: filePath, dependencies: ['react'], entities: { classes: [], functions: [] } };
  const rebuilt = await buildUpdatedCache(loaded, [filePath], [newParsed], []);

  assert.equal(rebuilt[filePath].mtime, newStat.mtimeMs);
  assert.equal(rebuilt[filePath].size, newStat.size);
  assert.deepEqual(rebuilt[filePath].data, newParsed);
});
