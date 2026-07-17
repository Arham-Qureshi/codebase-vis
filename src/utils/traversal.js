import fs from 'node:fs/promises';
import path from 'node:path';
import { KNOWN_EXTENSIONS } from '../parser/languages.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const DIR_CONCURRENCY = 32;

export async function discoverFiles(targetDir, ig) {
  const results = [];
  const root = path.resolve(targetDir);
  let ignoredCount = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    const relDir = path.relative(root, dir) || '.';

    const stats = await Promise.all(
      entries.map(e =>
        fs.lstat(path.join(dir, e))
          .then(s => ({ name: e, stats: s }))
          .catch(() => null)
      )
    );

    const dirPromises = [];

    for (const item of stats) {
      if (!item || item.stats.isSymbolicLink()) continue;

      const relPath = relDir === '.' ? item.name : path.join(relDir, item.name);

      if (ig.ignores(relPath)) {
        ignoredCount++;
        continue;
      }

      const fullPath = path.join(dir, item.name);
      if (item.stats.isDirectory()) {
        dirPromises.push(walk(fullPath));
      } else if (item.stats.isFile()) {
        if (item.stats.size > MAX_FILE_SIZE) continue;
        const ext = path.extname(item.name).toLowerCase();
        if (!KNOWN_EXTENSIONS.has(ext)) continue;
        results.push(path.resolve(fullPath));
      }
    }

    for (let i = 0; i < dirPromises.length; i += DIR_CONCURRENCY) {
      await Promise.all(dirPromises.slice(i, i + DIR_CONCURRENCY));
    }
  }

  await walk(root);
  return { files: results, ignoredCount };
}
