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

export async function installCursor(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates/cursor-hook.cjs');
  const hookDest = path.join(root, '.cursor', 'hooks', 'codebase-vis-hook.cjs');
  sandboxCheck(root, hookDest);
  const content = await fs.readFile(src, 'utf-8');
  await fs.mkdir(path.dirname(hookDest), { recursive: true });
  await fs.writeFile(hookDest, content, { mode: 0o755 });

  const configPath = path.join(root, '.cursor', 'hooks.json');
  sandboxCheck(root, configPath);
  let config = { version: 1, hooks: {} };
  try { config = JSON.parse(await fs.readFile(configPath, 'utf-8')); } catch {}
  config.version = 1;
  config.hooks = config.hooks || {};
  config.hooks.beforeShellExecution = config.hooks.beforeShellExecution || [];
  const alreadyInstalled = config.hooks.beforeShellExecution.some(
    (h) => h.command?.includes('codebase-vis-hook')
  );
  if (!alreadyInstalled) {
    config.hooks.beforeShellExecution.push({
      command: '.cursor/hooks/codebase-vis-hook.cjs',
      matcher: 'grep|rg|ripgrep|find|ag|ack',
    });
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }
}

export function isInstalledCursor(cwd) {
  try {
    const hookPath = path.join(path.resolve(cwd || process.cwd()), '.cursor', 'hooks', 'codebase-vis-hook.cjs');
    fsSync.statSync(hookPath);
    return true;
  } catch { return false; }
}

async function tryRemoveEmptyDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    if (entries.length === 0) await fs.rmdir(dirPath);
  } catch {}
}

export async function uninstallCursor(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const hookPath = path.join(root, '.cursor', 'hooks', 'codebase-vis-hook.cjs');
  try { await fs.unlink(hookPath); } catch {}

  const configPath = path.join(root, '.cursor', 'hooks.json');
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.hooks.beforeShellExecution = (config.hooks.beforeShellExecution || []).filter(
      (h) => !h.command?.includes('codebase-vis-hook')
    );
    if (config.hooks.beforeShellExecution.length === 0) delete config.hooks.beforeShellExecution;
    if (Object.keys(config.hooks).length === 0) delete config.hooks;
    if (Object.keys(config).length <= 1 && config.version) {
      await fs.unlink(configPath);
    } else {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
  } catch {}

  await tryRemoveEmptyDir(path.join(root, '.cursor', 'hooks'));
}
