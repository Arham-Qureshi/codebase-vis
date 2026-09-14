import * as p from '@clack/prompts';
import pc from 'picocolors';
import { detectWorkspace } from './detector.js';
import { installClaude, isInstalledClaude, uninstallClaude } from './platforms/claude.js';
import { installCursor, isInstalledCursor, uninstallCursor } from './platforms/cursor.js';
import { installOpencode, isInstalledOpencode, uninstallOpencode } from './platforms/opencode.js';
import {
  installCodex,
  installGemini,
  isInstalledCodex,
  isInstalledGemini,
  uninstallCodex,
  uninstallGemini,
} from './platforms/generic.js';
import { installMcp, isInstalledMcp, uninstallMcp } from './platforms/mcp.js';

export function getHookStatus(cwd) {
  const root = cwd || process.cwd();
  return {
    claude: isInstalledClaude(root),
    cursor: isInstalledCursor(root),
    opencode: isInstalledOpencode(root),
    codex: isInstalledCodex(root),
    gemini: isInstalledGemini(root),
    mcp: isInstalledMcp(root),
  };
}

export async function runHookInstaller(cwd, opts = {}) {
  const root = cwd || process.cwd();
  const detected = detectWorkspace(root);

  // Non-interactive modes (for CI / testing / --all flag)
  if (opts.all) {
    const all = ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'];
    p.log.info(pc.dim(`Installing all hooks: ${all.join(', ')}`));
    return deployHooks(root, all);
  }
  if (opts.platforms && Array.isArray(opts.platforms) && opts.platforms.length > 0) {
    const valid = opts.platforms.filter((k) => ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'].includes(k));
    if (valid.length === 0) {
      p.log.warn(pc.yellow(`No valid platforms in: ${opts.platforms.join(', ')}`));
      return [];
    }
    p.log.info(pc.dim(`Installing hooks for: ${valid.join(', ')}`));
    return deployHooks(root, valid);
  }

  const initialValues = Object.entries(detected)
    .filter(([k, v]) => v)
    .map(([k]) => k);

  const ALL = ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'];
  let selected;
  try {
    selected = await p.multiselect({
      message: 'Select AI coding agents used in this project: (space to toggle, enter to submit, a to toggle all)',
      options: [
        {
          value: 'claude',
          label: 'Claude Code (.claude/settings.local.json PreToolUse hook)',
          hint: detected.claude ? 'detected' : undefined,
        },
        {
          value: 'cursor',
          label: 'Cursor (.cursor/rules/codebase-vis.mdc rule)',
          hint: detected.cursor ? 'detected' : undefined,
        },
        {
          value: 'opencode',
          label: 'OpenCode (.opencode/plugins/codebase-vis-hook.ts plugin)',
          hint: detected.opencode ? 'detected' : undefined,
        },
        { value: 'codex', label: 'Codex / Aider (AGENTS.md)', hint: detected.codex ? 'detected' : undefined },
        { value: 'gemini', label: 'Gemini CLI (GEMINI.md)', hint: detected.gemini ? 'detected' : undefined },
        { value: 'mcp', label: 'MCP (.mcp.json stdio server)', hint: detected.mcp ? 'detected' : undefined },
      ],
      initialValues,
      required: true,
    });
  } catch (err) {
    p.log.warn(pc.yellow(`Interactive prompt failed (${err.message}). Falling back to auto-install.`));
    p.log.info(pc.dim(`Auto-installing for: ${ALL.join(', ')}`));
    return deployHooks(root, ALL);
  }

  if (p.isCancel(selected)) {
    const isTTY = process.stdin.isTTY && process.stdout.isTTY;
    if (!isTTY) {
      p.log.warn(pc.yellow('Prompt cancelled (non-interactive). Installing all hooks. Use --platforms to select subset.'));
      p.log.info(pc.dim(`Auto-installing for: ${ALL.join(', ')}`));
      return deployHooks(root, ALL);
    }
    return [];
  }
  if (!selected || selected.length === 0) {
    const isTTY = process.stdin.isTTY && process.stdout.isTTY;
    if (!isTTY) {
      p.log.warn(pc.yellow('No selection made (non-interactive). Installing all hooks. Use --platforms to select subset.'));
      p.log.info(pc.dim(`Auto-installing for: ${ALL.join(', ')}`));
      return deployHooks(root, ALL);
    }
    return [];
  }

  return deployHooks(root, selected);
}

async function deployHooks(root, selected) {

  const s = p.spinner();
  s.start('Deploying hooks');

  const deployed = [];
  try {
    if (selected.includes('claude')) {
      await installClaude(root);
      deployed.push('.codebase-vis/smart-grep-hook.cjs + .claude/settings.local.json');
    }
    if (selected.includes('cursor')) {
      await installCursor(root);
      deployed.push('.cursor/rules/codebase-vis.mdc');
    }
    if (selected.includes('opencode')) {
      await installOpencode(root);
      deployed.push('.opencode/plugins/codebase-vis-hook.ts');
    }
    if (selected.includes('codex')) {
      await installCodex(root);
      deployed.push('AGENTS.md (codebase-vis block)');
    }
    if (selected.includes('gemini')) {
      await installGemini(root);
      deployed.push('GEMINI.md (codebase-vis block)');
    }
    if (selected.includes('mcp')) {
      await installMcp(root);
      deployed.push('.mcp.json (codebase-vis MCP server)');
    }
  } catch (err) {
    s.stop(pc.red(`Deploy failed: ${err.message}`));
    throw err;
  }

  s.stop(pc.green(`Hooks deployed for: ${selected.join(', ')}`));
  for (const file of deployed) {
    p.log.success(pc.green(`  ✔ ${file}`));
  }
  return selected;
}

export async function runHookUninstall(cwd, targets) {
  const root = cwd || process.cwd();
  const toRemove = targets || ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'];
  if (toRemove.includes('claude')) await uninstallClaude(root);
  if (toRemove.includes('cursor')) await uninstallCursor(root);
  if (toRemove.includes('opencode')) await uninstallOpencode(root);
  if (toRemove.includes('codex')) await uninstallCodex(root);
  if (toRemove.includes('gemini')) await uninstallGemini(root);
  if (toRemove.includes('mcp')) await uninstallMcp(root);
  return toRemove;
}

export async function runHookUninstallSelective(cwd) {
  const root = cwd || process.cwd();
  const status = getHookStatus(root);
  const installed = Object.entries(status)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (installed.length === 0) return [];

  let selected;
  try {
    selected = await p.multiselect({
      message: 'Select hooks to remove: (space to toggle, enter to submit, a to toggle all)',
      options: installed.map((key) => {
        const labels = {
          claude: 'Claude Code (.claude/settings.local.json)',
          cursor: 'Cursor (.cursor/rules/codebase-vis.mdc)',
          opencode: 'OpenCode (.opencode/plugins/codebase-vis-hook.ts)',
          codex: 'Codex / Aider (AGENTS.md)',
          gemini: 'Gemini CLI (GEMINI.md)',
          mcp: 'MCP (.mcp.json stdio server)',
        };
        return { value: key, label: labels[key] || key };
      }),
      required: true,
    });
  } catch (err) {
    p.log.warn(pc.yellow(`Interactive prompt failed (${err.message}).`));
    p.log.info(pc.dim(`Run "codebase-vis hook uninstall --all" to remove all or "--platforms <list>" for selective removal.`));
    return [];
  }

  if (p.isCancel(selected)) {
    return [];
  }
  if (!selected || selected.length === 0) {
    const isTTY = process.stdin.isTTY && process.stdout.isTTY;
    if (!isTTY) {
      p.log.warn(pc.yellow('No selection made (non-interactive). Use --all or --platforms <list>.'));
      return [];
    }
    return [];
  }
  await runHookUninstall(root, selected);
  return selected;
}
