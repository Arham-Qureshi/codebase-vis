import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-cache-'));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('loadCache returns null when no cache file exists', async () => {
  const { loadCache } = await import('../../src/utils/cache.js');
  const result = await loadCache(tmpDir);
  assert.equal(result, null);
});

test('loadCache returns null for corrupted JSON', async () => {
  const { loadCache } = await import('../../src/utils/cache.js');
  await fs.writeFile(path.join(tmpDir, '.cache.json'), 'not-json', 'utf-8');
  const result = await loadCache(tmpDir);
  assert.equal(result, null);
});

test('loadCache returns null for wrong version', async () => {
  const { loadCache } = await import('../../src/utils/cache.js');
  await fs.writeFile(path.join(tmpDir, '.cache.json'), JSON.stringify({ version: 99, files: {} }), 'utf-8');
  const result = await loadCache(tmpDir);
  assert.equal(result, null);
});

test('loadCache returns files for valid cache', async () => {
  const { loadCache } = await import('../../src/utils/cache.js');
  const files = { '/a.js': { mtime: 100, size: 10, data: { id: '/a.js', dependencies: [] } } };
  await fs.writeFile(path.join(tmpDir, '.cache.json'), JSON.stringify({ version: 1, files }), 'utf-8');
  const result = await loadCache(tmpDir);
  assert.deepEqual(result, files);
});

test('saveCache writes valid cache file', async () => {
  const { saveCache, loadCache } = await import('../../src/utils/cache.js');
  const files = { '/b.js': { mtime: 200, size: 20, data: { id: '/b.js', dependencies: ['x'] } } };
  await saveCache(tmpDir, files);
  const reloaded = await loadCache(tmpDir);
  assert.deepEqual(reloaded, files);
});

test('saveCache overwrites existing cache', async () => {
  const { saveCache, loadCache } = await import('../../src/utils/cache.js');
  await saveCache(tmpDir, { '/old.js': { mtime: 1, size: 1, data: null } });
  await saveCache(tmpDir, { '/new.js': { mtime: 2, size: 2, data: null } });
  const reloaded = await loadCache(tmpDir);
  assert.equal(reloaded['/old.js'], undefined);
  assert.ok(reloaded['/new.js']);
});

test('splitFilesByCache returns all toParse when cache is empty', async () => {
  const { splitFilesByCache } = await import('../../src/utils/cache.js');
  const files = ['/a.js', '/b.js'];
  const result = await splitFilesByCache(files, {});
  assert.equal(result.toParse.length, 2);
  assert.equal(result.cachedResults.length, 0);
});

test('splitFilesByCache returns cached when mtime and size match', async () => {
  const { splitFilesByCache } = await import('../../src/utils/cache.js');
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
  const { splitFilesByCache } = await import('../../src/utils/cache.js');
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
  const { splitFilesByCache } = await import('../../src/utils/cache.js');
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

test('splitFilesByCache returns toParse when entry.data is null', async () => {
  const { splitFilesByCache } = await import('../../src/utils/cache.js');
  const filePath = path.join(tmpDir, 'null-data.js');
  await fs.writeFile(filePath, 'x', 'utf-8');
  const stat = await fs.stat(filePath);
  const cache = {
    [filePath]: { mtime: stat.mtimeMs, size: stat.size, data: null },
  };
  const result = await splitFilesByCache([filePath], cache);
  assert.equal(result.toParse.length, 1);
  assert.equal(result.cachedResults.length, 0);
});

test('splitFilesByCache handles missing file gracefully', async () => {
  const { splitFilesByCache } = await import('../../src/utils/cache.js');
  const cache = {
    '/nonexistent.js': { mtime: 100, size: 10, data: { id: '/nonexistent.js' } },
  };
  const result = await splitFilesByCache(['/nonexistent.js'], cache);
  assert.equal(result.toParse.length, 1);
  assert.equal(result.cachedResults.length, 0);
});

test('getStalePaths returns paths missing from discovered set', async () => {
  const { getStalePaths } = await import('../../src/utils/cache.js');
  const cache = { '/gone.js': { mtime: 1, size: 1, data: null } };
  const stale = getStalePaths(cache, new Set());
  assert.deepEqual(stale, ['/gone.js']);
});

test('getStalePaths returns empty when all paths current', async () => {
  const { getStalePaths } = await import('../../src/utils/cache.js');
  const cache = { '/here.js': { mtime: 1, size: 1, data: null } };
  const stale = getStalePaths(cache, new Set(['/here.js']));
  assert.equal(stale.length, 0);
});

test('buildUpdatedCache adds, removes, and preserves entries', async () => {
  const { buildUpdatedCache } = await import('../../src/utils/cache.js');
  const old = { '/keep.js': { mtime: 10, size: 10, data: { id: '/keep.js' } } };
  const newFile = path.join(tmpDir, 'new.js');
  await fs.writeFile(newFile, 'x', 'utf-8');
  const result = await buildUpdatedCache(old, [newFile], [{ id: newFile, dependencies: [] }], ['/stale.js']);
  assert.equal(result['/stale.js'], undefined);
  assert.deepEqual(result['/keep.js'], old['/keep.js']);
  assert.ok(result[newFile]);
});
