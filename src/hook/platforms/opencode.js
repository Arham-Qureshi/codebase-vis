import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function sandboxCheck(cwd, target) {
  const resolved = path.resolve(target);
  const root = path.resolve(cwd) + path.sep;
  if (!resolved.startsWith(root) && resolved !== path.resolve(cwd)) {
    throw new Error(`Path outside cwd: ${target}`);
  }
}

export async function installOpencode(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates/opencode-hook.ts');
  const dest = path.join(root, '.opencode', 'plugins', 'codebase-vis-hook.ts');
  sandboxCheck(root, dest);
  const content = await fs.readFile(src, 'utf-8');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, content, 'utf-8');
}

export function isInstalledOpencode(cwd) {
  try {
    fsSync.statSync(path.join(path.resolve(cwd || process.cwd()), '.opencode', 'plugins', 'codebase-vis-hook.ts'));
    return true;
  } catch {
    return false;
  }
}

async function tryRemoveEmptyDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    if (entries.length === 0) await fs.rmdir(dirPath);
  } catch {}
}

export async function uninstallOpencode(cwd) {
  const dest = path.join(path.resolve(cwd || process.cwd()), '.opencode', 'plugins', 'codebase-vis-hook.ts');
  try {
    await fs.unlink(dest);
  } catch {}
  await tryRemoveEmptyDir(path.join(path.resolve(cwd || process.cwd()), '.opencode', 'plugins'));
  // Do not remove .opencode itself if it still contains other files like package.json; tryRemoveEmptyDir will only remove if empty
  await tryRemoveEmptyDir(path.join(path.resolve(cwd || process.cwd()), '.opencode'));
}
