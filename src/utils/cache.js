import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { logger } from './logger.js';

const CACHE_VERSION = 1;
const STAT_BATCH = Math.min(os.availableParallelism() * 4, 100);
const CACHE_FILENAME = '.cache.json';
const MAX_CACHE_ENTRIES = 100000;

export async function loadCache(outDir) {
  const cachePath = path.join(outDir, CACHE_FILENAME);
  logger.debug('Cache', `Loading cache from ${path.relative(process.cwd(), cachePath)}`);
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const cache = JSON.parse(raw);
    if (cache && cache.version === CACHE_VERSION) {
      const files = cache.files || {};
      let validCount = 0;
      let invalidCount = 0;
      for (const [filePath, entry] of Object.entries(files)) {
        if (!entry || typeof entry !== 'object' ||
            typeof entry.mtime !== 'number' ||
            typeof entry.size !== 'number' ||
            (entry.data !== undefined && entry.data !== null && typeof entry.data !== 'object')) {
          delete files[filePath];
          invalidCount++;
        } else {
          validCount++;
        }
      }
      logger.info('Cache', `Cache loaded — ${validCount} valid entries, ${invalidCount} invalid pruned, version=${CACHE_VERSION}`);
      return files;
    }
    logger.warn('Cache', `Cache version mismatch — expected ${CACHE_VERSION}, got ${cache?.version}`);
    return null;
  } catch (err) {
    logger.warn('Cache', 'Cache load failed');
    return null;
  }
}

export async function saveCache(outDir, files) {
  const entryCount = Object.keys(files).length;
  logger.debug('Cache', `Saving cache — ${entryCount} entries to ${path.relative(process.cwd(), path.join(outDir, CACHE_FILENAME))}`);
  const cache = { version: CACHE_VERSION, files };
  const targetPath = path.join(outDir, CACHE_FILENAME);
  await fs.writeFile(targetPath, JSON.stringify(cache, null, 2), 'utf-8');
  logger.info('Cache', `Cache saved — ${entryCount} entries, ${Math.round(JSON.stringify(cache).length / 1024)}KB`);
}

export async function splitFilesByCache(discoveredFiles, cache) {
  let hitCount = 0;
  let missCount = 0;
  let staleCount = 0;
  const toParse = [];
  const cachedResults = [];

  for (let i = 0; i < discoveredFiles.length; i += STAT_BATCH) {
    const batch = discoveredFiles.slice(i, i + STAT_BATCH);
    const stats = await Promise.allSettled(batch.map(f => fs.stat(f)));

    for (let j = 0; j < batch.length; j++) {
      const filePath = batch[j];
      const relPath = path.relative(process.cwd(), filePath);
      const entry = cache[relPath];
      const statResult = stats[j];

      if (!entry) {
        toParse.push(filePath);
        missCount++;
        continue;
      }

      if (statResult.status === 'fulfilled') {
        const stat = statResult.value;
        if (stat.mtimeMs === entry.mtime && stat.size === entry.size) {
          if (entry.data !== undefined && entry.data !== null &&
              typeof entry.data.id === 'string') {
            cachedResults.push(entry.data);
            hitCount++;
          } else {
            toParse.push(filePath);
            staleCount++;
          }
        } else {
          toParse.push(filePath);
          staleCount++;
        }
      } else {
        toParse.push(filePath);
        staleCount++;
      }
    }
  }

  logger.debug('Cache', `Split complete — ${hitCount} hits, ${missCount} misses, ${staleCount} stale of ${discoveredFiles.length} files`);
  return { toParse, cachedResults };
}

export function getStalePaths(cache, discoveredSet) {
  const stale = [];
  const relativeSet = new Set([...discoveredSet].map(p => path.relative(process.cwd(), p)));
  for (const filePath of Object.keys(cache)) {
    if (!relativeSet.has(filePath)) {
      stale.push(filePath);
    }
  }
  if (stale.length > 0) {
    logger.debug('Cache', `${stale.length} stale paths found in cache (no longer in discovered set)`);
  }
  return stale;
}

export async function buildUpdatedCache(oldCache, toParseFiles, parsedResults, stalePaths) {
  const beforeCount = Object.keys(oldCache).length;
  logger.debug('Cache', `Building updated cache — ${beforeCount} existing, ${toParseFiles.length} to parse, ${stalePaths.length} stale to remove`);

  const updated = { ...oldCache };

  for (const filePath of stalePaths) {
    delete updated[filePath];
  }

  let addedCount = 0;
  let failedCount = 0;

  const toStat = parsedResults.filter(r => r && r.id);
  for (let i = 0; i < toStat.length; i += STAT_BATCH) {
    const batch = toStat.slice(i, i + STAT_BATCH);
    const stats = await Promise.allSettled(batch.map(r => fs.stat(r.id)));

    for (let j = 0; j < batch.length; j++) {
      const result = batch[j];
      const statResult = stats[j];

      if (statResult.status === 'fulfilled') {
        const stat = statResult.value;
        updated[result.id] = {
          mtime: stat.mtimeMs,
          size: stat.size,
          data: result,
        };
        addedCount++;
      } else {
        logger.warn('Cache', `Stat failed for parsed result ${result.id} — removing from cache`);
        delete updated[result.id];
        failedCount++;
      }
    }
  }

  const keys = Object.keys(updated);
  if (keys.length > MAX_CACHE_ENTRIES) {
    const evictCount = keys.length - MAX_CACHE_ENTRIES;
    const sorted = keys.sort((a, b) => (updated[a].mtime || 0) - (updated[b].mtime || 0));
    for (let i = 0; i < evictCount; i++) {
      delete updated[sorted[i]];
    }
    logger.info('Cache', `Cache eviction — ${evictCount} oldest entries removed to stay under ${MAX_CACHE_ENTRIES} limit`);
  }

  logger.info('Cache', `Cache updated — ${Object.keys(updated).length} entries (${addedCount} added, ${failedCount} failed, ${stalePaths.length} stale removed)`);
  return updated;
}
