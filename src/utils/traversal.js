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

const ALLOWED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const MAX_FILE_SIZE = 2 * 1024 * 1024;

// using recursive search
export async function discoverFiles(targetDir, customIgnores = []) {
  // merge hardcoded + custom ignores into a single set for O(1) lookup
  const ignoreSet = new Set([...BASELINE_IGNORES, ...customIgnores]);
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      if (ignoreSet.has(entry)) continue;

      const fullPath = path.join(dir, entry);

      // not stat so we don't follow symlinks
      const stats = await fs.lstat(fullPath);

      if (stats.isSymbolicLink()) continue;

      if (stats.isDirectory()) {
        await walk(fullPath);
      } else if (stats.isFile()) {
        if (stats.size > MAX_FILE_SIZE) continue;

        const ext = path.extname(entry).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;

        results.push(path.resolve(fullPath));
      }
    }
  }

  await walk(path.resolve(targetDir));
  return results;
}