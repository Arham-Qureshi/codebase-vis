import * as p from '@clack/prompts';
import pc from 'picocolors';
import { runHookInstaller, runHookUninstall, runHookUninstallSelective, getHookStatus } from '../../hook/installer.js';

export async function hookInstallCommand(options = {}) {
  p.intro(pc.bgCyan(pc.black(' codebase-vis hook install ')));
  const opts = {};
  if (options.all) opts.all = true;
  if (options.platforms) {
    opts.platforms = options.platforms
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  const selected = await runHookInstaller(process.cwd(), opts);
  if (selected.length === 0) {
    p.outro(pc.dim('No hooks installed.'));
  } else {
    p.outro(pc.green(`✔ Hooks installed for: ${selected.join(', ')}`));
  }
}

export async function hookUninstallCommand(options = {}) {
  p.intro(pc.bgRed(pc.white(' codebase-vis hook uninstall ')));
  const status = getHookStatus(process.cwd());
  const any = Object.values(status).some(Boolean);
  if (!any) {
    p.outro(pc.dim('No hooks installed.'));
    return;
  }
  // Non-interactive modes
  if (options.all) {
    const allInstalled = Object.entries(status)
      .filter(([, v]) => v)
      .map(([k]) => k);
    await runHookUninstall(process.cwd(), allInstalled);
    p.outro(pc.green(`✔ Removed all hooks: ${allInstalled.join(', ')}`));
    return;
  }
  if (options.platforms) {
    const raw = options.platforms
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const valid = raw.filter((k) => ['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'].includes(k));
    const invalid = raw.filter((k) => !['claude', 'cursor', 'opencode', 'codex', 'gemini', 'mcp'].includes(k));
    if (invalid.length > 0) {
      p.log.warn(pc.yellow(`Ignoring invalid platforms: ${invalid.join(', ')}`));
    }
    if (valid.length === 0) {
      p.log.warn(pc.yellow(`No valid platforms in: ${raw.join(', ')}`));
      p.outro(pc.dim('No hooks removed.'));
      return;
    }
    await runHookUninstall(process.cwd(), valid);
    p.outro(pc.green(`✔ Removed hooks for: ${valid.join(', ')}`));
    return;
  }
  p.log.message(pc.dim('Currently installed:'));
  for (const [key, installed] of Object.entries(status)) {
    if (installed) p.log.message(`  ${pc.green('●')} ${key}`);
  }
  const selected = await runHookUninstallSelective(process.cwd());
  if (selected.length === 0) {
    p.outro(pc.dim('No hooks removed.'));
    return;
  }
  for (const key of selected) {
    p.log.success(pc.green(`  ✔ Removed ${key}`));
  }
  p.outro(pc.green(`✔ Removed hooks for: ${selected.join(', ')}`));
}

export async function hookStatusCommand() {
  p.intro(pc.bgCyan(pc.black(' codebase-vis hook status ')));
  const status = getHookStatus(process.cwd());
  for (const [key, installed] of Object.entries(status)) {
    const icon = installed ? pc.green('●') : pc.dim('○');
    const label = installed ? pc.green('installed') : pc.dim('not installed');
    p.log.message(`${icon} ${key}: ${label}`);
  }
  p.outro(pc.dim('Run codebase-vis hook install to configure.'));
}

export function registerHookCommand(program) {
  const hook = program.command('hook').description('Manage agent hooks (graph-first interception)');
  hook
    .command('install')
    .description('Install hooks for detected AI agents')
    .option('--all', 'Install all platforms without prompting')
    .option('--platforms <list>', 'Comma-separated platforms: claude,cursor,opencode,codex,gemini,mcp')
    .action(hookInstallCommand);
  hook
    .command('uninstall')
    .description('Remove all hooks')
    .option('--all', 'Remove all without prompting')
    .option('--platforms <list>', 'Comma-separated platforms to remove')
    .action(hookUninstallCommand);
  hook
    .command('status')
    .description('Show hook installation status')
    .action(hookStatusCommand);
  return hook;
}
