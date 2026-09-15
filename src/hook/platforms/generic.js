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

export async function installGemini(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates/gemini-hook.cjs');
  const hookDest = path.join(root, '.gemini', 'hooks', 'codebase-vis-hook.cjs');
  sandboxCheck(root, hookDest);
  const content = await fs.readFile(src, 'utf-8');
  await fs.mkdir(path.dirname(hookDest), { recursive: true });
  await fs.writeFile(hookDest, content, { mode: 0o755 });

  const configPath = path.join(root, '.gemini', 'settings.json');
  sandboxCheck(root, configPath);
  let config = { hooks: {} };
  try { config = JSON.parse(await fs.readFile(configPath, 'utf-8')); } catch {}
  config.hooks = config.hooks || {};
  config.hooks.BeforeTool = config.hooks.BeforeTool || [];
  const alreadyInstalled = config.hooks.BeforeTool.some(
    (h) => h.hooks?.some((hook) => hook.command?.includes('codebase-vis-hook'))
  );
  if (!alreadyInstalled) {
    config.hooks.BeforeTool.push({
      matcher: 'run_shell_command',
      hooks: [{
        type: 'command',
        command: '.gemini/hooks/codebase-vis-hook.cjs',
        name: 'codebase-vis-graph-search',
      }],
    });
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }
}

export function isInstalledGemini(cwd) {
  try {
    const hookPath = path.join(path.resolve(cwd || process.cwd()), '.gemini', 'hooks', 'codebase-vis-hook.cjs');
    fsSync.statSync(hookPath);
    return true;
  } catch { return false; }
}

export async function uninstallGemini(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const hookPath = path.join(root, '.gemini', 'hooks', 'codebase-vis-hook.cjs');
  try { await fs.unlink(hookPath); } catch {}

  const configPath = path.join(root, '.gemini', 'settings.json');
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.hooks.BeforeTool = (config.hooks.BeforeTool || []).filter(
      (h) => !h.hooks?.some((hook) => hook.command?.includes('codebase-vis-hook'))
    );
    if (config.hooks.BeforeTool.length === 0) delete config.hooks.BeforeTool;
    if (Object.keys(config.hooks).length === 0) delete config.hooks;
    if (Object.keys(config).length === 0) {
      await fs.unlink(configPath);
    } else {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
  } catch {}

  try {
    const entries = await fs.readdir(path.join(root, '.gemini', 'hooks'));
    if (entries.length === 0) await fs.rmdir(path.join(root, '.gemini', 'hooks'));
  } catch {}
}

export async function installCopilot(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates/copilot-hook.cjs');
  const hookDest = path.join(root, '.github', 'hooks', 'codebase-vis-hook.cjs');
  sandboxCheck(root, hookDest);
  const content = await fs.readFile(src, 'utf-8');
  await fs.mkdir(path.dirname(hookDest), { recursive: true });
  await fs.writeFile(hookDest, content, { mode: 0o755 });

  const configPath = path.join(root, '.github', 'hooks', 'codebase-vis.json');
  sandboxCheck(root, configPath);
  let config = { version: 1, hooks: {} };
  try { config = JSON.parse(await fs.readFile(configPath, 'utf-8')); } catch {}
  config.version = 1;
  config.hooks = config.hooks || {};
  config.hooks.preToolUse = config.hooks.preToolUse || [];
  const alreadyInstalled = config.hooks.preToolUse.some(
    (h) => h.bash?.includes('codebase-vis-hook')
  );
  if (!alreadyInstalled) {
    config.hooks.preToolUse.push({
      type: 'command',
      bash: '.github/hooks/codebase-vis-hook.cjs',
      matcher: 'bash',
    });
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }
}

export function isInstalledCopilot(cwd) {
  try {
    const hookPath = path.join(path.resolve(cwd || process.cwd()), '.github', 'hooks', 'codebase-vis-hook.cjs');
    fsSync.statSync(hookPath);
    return true;
  } catch { return false; }
}

export async function uninstallCopilot(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const hookPath = path.join(root, '.github', 'hooks', 'codebase-vis-hook.cjs');
  try { await fs.unlink(hookPath); } catch {}

  const configPath = path.join(root, '.github', 'hooks', 'codebase-vis.json');
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.hooks.preToolUse = (config.hooks.preToolUse || []).filter(
      (h) => !h.bash?.includes('codebase-vis-hook')
    );
    if (config.hooks.preToolUse.length === 0) delete config.hooks.preToolUse;
    if (Object.keys(config.hooks).length === 0) delete config.hooks;
    if (Object.keys(config).length <= 1 && config.version) {
      await fs.unlink(configPath);
    } else {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
  } catch {}

  try {
    const entries = await fs.readdir(path.join(root, '.github', 'hooks'));
    if (entries.length === 0) await fs.rmdir(path.join(root, '.github', 'hooks'));
  } catch {}
}
