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

export async function installClaude(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const hookSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates/smart-grep-hook.cjs');
  const hookDest = path.join(root, '.codebase-vis', 'smart-grep-hook.cjs');
  const hookContent = await fs.readFile(hookSrc, 'utf-8');
  sandboxCheck(root, hookDest);
  await fs.mkdir(path.dirname(hookDest), { recursive: true });
  await fs.writeFile(hookDest, hookContent, { mode: 0o755 });
  try {
    await fs.chmod(hookDest, 0o755);
  } catch {}

  const settingsPath = path.join(root, '.claude', 'settings.local.json');
  sandboxCheck(root, settingsPath);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  let settings = {};
  try {
    settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
  } catch {}
  settings.hooks = settings.hooks || {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  const alreadyInstalled = settings.hooks.PreToolUse.some(
    (h) => h.matcher === 'Bash' && JSON.stringify(h.hooks).includes('smart-grep-hook')
  );
  if (!alreadyInstalled) {
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'node .codebase-vis/smart-grep-hook.cjs' }],
    });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  }
}

export function isInstalledClaude(cwd) {
  try {
    const raw = fsSync.readFileSync(path.join(path.resolve(cwd || process.cwd()), '.claude', 'settings.local.json'), 'utf-8');
    const settings = JSON.parse(raw);
    return (settings.hooks?.PreToolUse || []).some((h) => JSON.stringify(h).includes('smart-grep-hook'));
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

export async function uninstallClaude(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const settingsPath = path.join(root, '.claude', 'settings.local.json');
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
    const before = (settings.hooks?.PreToolUse || []).length;
    settings.hooks.PreToolUse = (settings.hooks.PreToolUse || []).filter(
      (h) => !JSON.stringify(h).includes('smart-grep-hook')
    );
    if (settings.hooks.PreToolUse.length !== before) {
      const hasOtherHooks = Object.keys(settings.hooks || {}).some((k) => {
        const arr = settings.hooks[k];
        return Array.isArray(arr) && arr.length > 0;
      });
      const hasOtherTopKeys = Object.keys(settings).some((k) => k !== 'hooks');
      if (!hasOtherHooks && !hasOtherTopKeys) {
        try { await fs.unlink(settingsPath); } catch {}
        await tryRemoveEmptyDir(path.join(root, '.claude'));
      } else {
        if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
        const isEmpty = Object.keys(settings).length === 0;
        if (isEmpty) {
          try { await fs.unlink(settingsPath); } catch {}
          await tryRemoveEmptyDir(path.join(root, '.claude'));
        } else {
          await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        }
      }
    }
  } catch {}
  const hookPath = path.join(root, '.codebase-vis', 'smart-grep-hook.cjs');
  try {
    await fs.unlink(hookPath);
  } catch {}
  try {
    await fs.unlink(path.join(root, '.codebase-vis', 'smart-grep-hook.js'));
  } catch {}
  await tryRemoveEmptyDir(path.join(root, '.codebase-vis'));
}
