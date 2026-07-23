#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
const { version } = createRequire(import.meta.url)('../package.json');
import { initCommand, generateCommand, cleanCommand, serveCommand, queryCommand, pathCommand, explainCommand, detectCommand, statCommand } from '../src/cli/commands/index.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import picocolors from 'picocolors';

function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

async function checkForUpdate() {
  const cacheDir = join(homedir(), '.codebase-vis');
  const cacheFile = join(cacheDir, 'update-check.json');

  if (existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'));
      if (Date.now() - cached.timestamp < 3_600_000) {
        if (cached.latest !== version && semverGt(cached.latest, version)) {
          console.error(picocolors.yellow(`\n  ✦ Update available: ${version} → ${cached.latest}`));
          console.error(picocolors.yellow('  ✦ Run "npm install -g codebase-vis" to upgrade\n'));
        }
        return;
      }
    } catch { }
  }

  try {
    const res = await fetch('https://registry.npmjs.org/codebase-vis/latest');
    const data = await res.json();
    const latest = data.version;

    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify({ latest, timestamp: Date.now() }));
    } catch { }

    if (latest !== version && semverGt(latest, version)) {
      console.error(picocolors.yellow(`\n  ✦ Update available: ${version} → ${latest}`));
      console.error(picocolors.yellow('  ✦ Run "npm install -g codebase-vis" to upgrade\n'));
    }
  } catch { }
}

const program = new Command();
program.name('codebase-vis').version(version);

const B = (s) => picocolors.bold(s);
const D = (s) => picocolors.dim(s);
const C = (s) => picocolors.cyan(s);

program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
  formatHelp(cmd, helper) {
    const isRoot = cmd === program;
    const usage = helper.commandUsage(cmd);

    let out = `\n${B('codebase-vis')} ${C(`v${version}`)}    ${D('Parse → Graph → Visualize')}\n`;
    out += `${D('A CLI tool that turns codebases into interactive dependency graphs.')}\n\n`;

    out += `${B('USAGE')}\n  ${C(usage)}\n\n`;

    if (!isRoot) {
      // Subcommand help: show description, arguments, options
      const cmdDesc = helper.commandDescription(cmd);
      if (cmdDesc) out += `${B('DESCRIPTION')}\n  ${cmdDesc}\n\n`;
      const args = helper.visibleArguments(cmd);
      if (args.length > 0) {
        out += `${B('ARGUMENTS')}\n`;
        for (const arg of args) {
          out += `  ${C(helper.argumentTerm(arg))}  ${D(helper.argumentDescription(arg))}\n`;
        }
        out += '\n';
      }
      const opts = helper.visibleOptions(cmd);
      if (opts.length > 0) {
        out += `${B('OPTIONS')}\n`;
        for (const opt of opts) {
          out += `  ${C(helper.optionTerm(opt).padEnd(28))}${D(helper.optionDescription(opt))}\n`;
        }
        out += '\n';
      }
    } else {
      out += `${B('COMMANDS')}\n`;
      const cmds = helper.visibleCommands(cmd).filter(c => c.name() !== 'help');
      const commandSpecs = [
        { name: 'init', syntax: 'init', desc: 'Prepare your project for parsing', use: 'Run before first generate to set up ignore rules' },
        {
          name: 'generate', syntax: 'generate [paths...]', desc: 'Parse source files and build the dependency graph', use: 'Analyze project structure and dependencies', flags: [
            ['--ignore <paths>', 'Directories to skip (comma-separated)'],
            ['--no-clear', 'Skip clearing the terminal'],
            ['--verbose', 'Show per-file parse errors'],
            ['--jobs <number>', 'Parallel workers (default: CPU count - 1)'],
          ]
        },
        { name: 'clean', syntax: 'clean', desc: 'Remove the generated codebase-out/ directory', use: 'Start fresh or free up disk space' },
        {
          name: 'serve', syntax: 'serve', desc: 'Launch the interactive graph viewer in your browser', use: 'Explore the dependency graph visually', flags: [
            ['-p, --port <number>', 'Port to run on (default: 3000)'],
          ]
        },
        { name: 'query', syntax: 'query <target>', desc: 'Inspect a node\'s dependencies and dependents', use: 'Understand how a specific file connects to the codebase' },
        { name: 'path', syntax: 'path <source> <target>', desc: 'Find the shortest dependency path between two nodes', use: 'Discover how two files are related' },
        {
          name: 'explain', syntax: 'explain', desc: 'Generate AI-powered semantic summaries of your codebase', use: 'Get high-level architectural understanding via LLM', flags: [
            ['--reset', 'Reset saved API credentials'],
            ['--model <name>', 'Override the LLM model'],
            ['--concurrency <number>', 'Parallel LLM requests (default: 2)'],
            ['--rpm <number>', 'Requests per minute limit (default: 30)'],
            ['--retry', 'Retry only previously failed clusters'],
          ]
        },
        {
          name: 'stat', syntax: 'stat [target]', desc: 'Show codebase statistics and hotspots', use: 'Analyze composition, languages, and hotspots', flags: [
            ['--json', 'Output as JSON for programmatic use'],
            ['--top <number>', 'Number of hotspots to display (default: 5)'],
            ['--all', 'Show all hotspots (no limit)'],
            ['--verbose', 'Show extended detail'],
            ['--out <path>', 'Write JSON output to a file (requires --json)'],
          ]
        },
      ];
      for (const spec of commandSpecs) {
        out += `  ${B(spec.syntax)}\n`;
        out += `    ${D(spec.desc)}\n`;
        out += `    ${D('Use:')} ${spec.use}\n`;
        if (spec.flags) {
          out += `    ${D('Flags:')}\n`;
          for (const [flag, flagDesc] of spec.flags) {
            out += `      ${C(flag.padEnd(26))}${D(flagDesc)}\n`;
          }
        }
        out += '\n';
      }
    }

    if (isRoot) {
      out += `${B('GLOBAL OPTIONS')}\n`;
      const globalOpts = helper.visibleOptions(cmd).filter(o =>
        o.long !== '--help' && o.long !== '--version'
      );
      for (const opt of globalOpts) {
        out += `  ${C(helper.optionTerm(opt).padEnd(28))}${D(helper.optionDescription(opt))}\n`;
      }
      out += `  ${C('-h, --help'.padEnd(28))}${D('Display this help message')}\n`;
      out += `  ${C('-V, --version'.padEnd(28))}${D('Display the version number')}\n\n`;

      out += `${B('EXAMPLES')}\n`;
      const examples = [
        ['codebase-vis init', 'Prepare project for parsing'],
        ['codebase-vis generate', 'Build dependency graph'],
        ['codebase-vis generate --verbose', 'Debug parsing issues'],
        ['codebase-vis serve -p 8080', 'View graph in browser'],
        ['codebase-vis query src/index.js', 'Check a file\'s dependencies'],
        ['codebase-vis explain', 'AI-powered codebase summary'],
        ['codebase-vis explain --retry', 'Retry failed clusters'],
        ['codebase-vis stat', 'Show codebase statistics and hotspots'],
      ];
      for (const [exCmd, exDesc] of examples) {
        out += `  ${C(exCmd.padEnd(38))}${D(exDesc)}\n`;
      }
      out += '\n';
    }

    return out;
  }
});

program
  .command('init')
  .description(
    `${D('Prepare your project for parsing')}\n` +
    `${D('Creates a .agentignore file to define which files to skip.')}`
  )
  .action(initCommand);

program
  .command('generate [paths...]')
  .description(
    `${D('Parse source files and build the dependency graph')}\n` +
    `${D('Scans your project, extracts imports/exports, and outputs graph.json + graph.html.')}`
  )
  .option('--ignore <paths>', 'Comma-separated list of additional directories to skip')
  .option('--no-clear', 'Skip clearing the terminal')
  .option('--verbose', 'Show detailed per-file parse errors')
  .option('--jobs <number>', 'Number of parallel parse workers (default: CPU count - 1)')
  .action(generateCommand);

program
  .command('clean')
  .description(
    `${D('Remove generated output')}\n` +
    `${D('Deletes the codebase-out/ directory to start fresh.')}`
  )
  .action(cleanCommand);

program
  .command('serve')
  .description(
    `${D('Launch the interactive graph viewer')}\n` +
    `${D('Starts a local web server to explore the dependency graph in your browser.')}`
  )
  .option('-p, --port <number>', 'Port to run on', '3000')
  .action(serveCommand);

program
  .command('query <target>')
  .description(
    `${D('Inspect a node\'s dependencies and dependents')}\n` +
    `${D('Shows what a file imports and what imports it.')}`
  )
  .action(queryCommand);

program
  .command('path <source> <target>')
  .description(
    `${D('Find the shortest dependency path between two files')}\n` +
    `${D('Traces how two nodes are connected through the dependency graph.')}`
  )
  .action(pathCommand);

program
  .command('explain')
  .description(
    `${D('Generate AI-powered semantic summaries of your codebase')}\n` +
    `${D('Uses an LLM to describe each cluster of files and their roles.')}`
  )
  .option('--reset', 'Reset saved API credentials and model configuration')
  .option('--model <name>', 'Override the configured LLM model to use')
  .option('--concurrency <number>', 'Number of parallel LLM requests (default: 2, max: 5)', '2')
  .option('--rpm <number>', 'Rate limit in requests per minute for the Groq API (default: 30)', '30')
  .option('--retry', 'Retry only the clusters that failed in the last explain run')
  .action(explainCommand);

program
  .command('detect')
  .description(
    `${D('Detect circular dependencies in your codebase')}\n` +
    `${D('Loads graph.json, finds cycles, writes cycles.json for visualization.')}`
  )
  .action(detectCommand);

program
  .command('stat [target]')
  .description(
    `${D('Show codebase statistics and hotspots')}\n` +
    `${D('Analyzes the dependency graph for aggregate metrics.')}`
  )
  .option('--json', 'Output as JSON for programmatic use')
  .option('--top <number>', 'Number of hotspots to display (default: 5)', '5')
  .option('--all', 'Show all hotspots (no limit)')
  .option('--verbose', 'Show extended detail (isolated files, entity list)')
  .option('--out <path>', 'Write JSON output to a file (requires --json)')
  .action(statCommand);

program.hook('postAction', async () => {
  const start = process.__codebaseVisStartTime || program._actionTime;
  const elapsed = Date.now() - start;
  delete process.__codebaseVisStartTime;
  console.error(picocolors.dim(`\n  ⏱ ${elapsed}ms`));
  await checkForUpdate();
});

program.hook('preAction', () => {
  program._actionTime = Date.now();
});

program.parse(process.argv);
