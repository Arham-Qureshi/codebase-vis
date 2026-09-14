import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { hookInstallCommand, hookUninstallCommand, hookStatusCommand, registerHookCommand } from '../../src/cli/commands/hook.js';

describe('hook CLI', () => {
  it('exports hook commands as functions', () => {
    assert.equal(typeof hookInstallCommand, 'function');
    assert.equal(typeof hookUninstallCommand, 'function');
    assert.equal(typeof hookStatusCommand, 'function');
    assert.equal(typeof registerHookCommand, 'function');
  });

  it('registerHookCommand exposes --all and --platforms options', () => {
    const prog = new Command();
    registerHookCommand(prog);
    const hook = prog.commands.find((c) => c.name() === 'hook');
    const install = hook.commands.find((c) => c.name() === 'install');
    const uninstall = hook.commands.find((c) => c.name() === 'uninstall');
    assert.ok(install.options.some((o) => o.long === '--all'), 'install should have --all');
    assert.ok(install.options.some((o) => o.long === '--platforms'), 'install should have --platforms');
    assert.ok(uninstall.options.some((o) => o.long === '--all'), 'uninstall should have --all');
    assert.ok(uninstall.options.some((o) => o.long === '--platforms'), 'uninstall should have --platforms');
  });

  it('registerHookCommand install parses --all via commander', () => {
    const prog = new Command();
    prog.exitOverride();
    registerHookCommand(prog);
    let captured = null;
    const hook = prog.commands.find((c) => c.name() === 'hook');
    const install = hook.commands.find((c) => c.name() === 'install');
    const origAction = install._actionHandler;
    prog.commands.find((c) => c.name() === 'hook').commands.find((c) => c.name() === 'install').action((opts) => { captured = opts; });
    try { prog.parse(['hook', 'install', '--all'], { from: 'user' }); } catch {}
    assert.ok(captured && captured.all === true);
  });
});
