import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_VERSION = 1;
const CACHE_FILENAME = '.cache.json';

export async function loadCache(outDir) {
  try {
    const raw = await fs.readFile(path.join(outDir, CACHE_FILENAME), 'utf-8');
    const cache = JSON.parse(raw);
    if (cache && cache.version === CACHE_VERSION) {
      return cache.files || {};
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCache(outDir, files) {
  const cache = { version: CACHE_VERSION, files };
  const targetPath = path.join(outDir, CACHE_FILENAME);
  await fs.writeFile(targetPath, JSON.stringify(cache, null, 2), 'utf-8');
}

export async function splitFilesByCache(discoveredFiles, cache) {
  const toParse = [];
  const cachedResults = [];

  for (const filePath of discoveredFiles) {
    const entry = cache[filePath];
    if (!entry) {
      toParse.push(filePath);
      continue;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs === entry.mtime && stat.size === entry.size) {
        if (entry.data !== undefined && entry.data !== null) {
          cachedResults.push(entry.data);
        } else {
          toParse.push(filePath);
        }
      } else {
        toParse.push(filePath);
      }
    } catch {
      toParse.push(filePath);
    }
  }

  return { toParse, cachedResults };
}

export function getStalePaths(cache, discoveredSet) {
  const stale = [];
  for (const filePath of Object.keys(cache)) {
    if (!discoveredSet.has(filePath)) {
      stale.push(filePath);
    }
  }
  return stale;
}

export async function buildUpdatedCache(oldCache, toParseFiles, parsedResults, stalePaths) {
  const updated = { ...oldCache };

  for (const filePath of stalePaths) {
    delete updated[filePath];
  }

  for (const result of parsedResults) {
    if (result && result.id) {
      try {
        const stat = await fs.stat(result.id);
        updated[result.id] = {
          mtime: stat.mtimeMs,
          size: stat.size,
          data: result,
        };
      } catch {
        delete updated[result.id];
      }
    }
  }

  return updated;
}