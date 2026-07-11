#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
const { version } = createRequire(import.meta.url)('../package.json');
import { initCommand, generateCommand, cleanCommand, serveCommand, queryCommand, pathCommand, explainCommand } from '../src/cli/commands/index.js';
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

program
  .name('codebase-vis')
  .version(version)
  .description('A local CLI tool that parses codebases, builds dependency graphs, and outputs interactive architecture visualizations.');

program
  .command('init')
  .description('Create a boilerplate .agentignore file in the current directory')
  .action(initCommand);

program
  .command('generate [paths...]')
  .description('Parse the codebase (or specific paths) and generate the dependency graph')
  .option('--ignore <paths>', 'Comma-separated list of additional directories to skip')
  .option('--no-clear', 'Skip clearing the terminal')
  .option('--verbose', 'Show detailed per-file parse errors')
  .option('--jobs <number>', 'Number of parallel parse workers (default: CPU count - 1)')
  .action(generateCommand);

program
  .command('clean')
  .description('Delete the generated codebase-out/ directory')
  .action(cleanCommand);

program
  .command('serve')
  .description('Start a local web server to view the generated graph')
  .option('-p, --port <number>', 'Port to run on', '3000')
  .action(serveCommand);

program
  .command('query <target>')
  .description('Look up a node\'s dependencies and dependents from the generated graph')
  .action(queryCommand);

program
  .command('path <source> <target>')
  .description('Trace the shortest dependency path between two nodes in the graph')
  .action(pathCommand);

program
  .command('explain')
  .description('Generate a semantic summary of the codebase using an LLM')
  .option('--reset', 'Reset saved API credentials and model configuration')
  .option('--model <name>', 'Override the configured LLM model to use')
  .option('--concurrency <number>', 'Number of parallel LLM requests (default: 2, max: 5)', '2')
  .option('--rpm <number>', 'Rate limit in requests per minute for the Groq API (default: 30)', '30')
  .action(explainCommand);

program.hook('postAction', async () => {
  await checkForUpdate();
});

program.parse(process.argv);
