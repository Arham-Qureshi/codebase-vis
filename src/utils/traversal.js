import fs from 'node:fs/promises';
import path from 'node:path';

const BASELINE_IGNORES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  'coverage',
  '.agent',
  'codebase-out',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.py',
  '.cpp', '.h', '.hpp',
  '.html', '.css',
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const DIR_CONCURRENCY = 32;

export async function discoverFiles(targetDir, customIgnores = []) {
  const ignoreSet = new Set([...BASELINE_IGNORES, ...customIgnores]);
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir);
    const filtered = entries.filter(e => !ignoreSet.has(e));

    const stats = await Promise.all(
      filtered.map(e =>
        fs.lstat(path.join(dir, e))
          .then(s => ({ name: e, stats: s }))
          .catch(() => null)
      )
    );

    const dirPromises = [];

    for (const item of stats) {
      if (!item || item.stats.isSymbolicLink()) continue;
      const fullPath = path.join(dir, item.name);
      if (item.stats.isDirectory()) {
        dirPromises.push(walk(fullPath));
      } else if (item.stats.isFile()) {
        if (item.stats.size > MAX_FILE_SIZE) continue;
        const ext = path.extname(item.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;
        results.push(path.resolve(fullPath));
      }
    }

    for (let i = 0; i < dirPromises.length; i += DIR_CONCURRENCY) {
      await Promise.all(dirPromises.slice(i, i + DIR_CONCURRENCY));
    }
  }

  await walk(path.resolve(targetDir));
  return results;
}