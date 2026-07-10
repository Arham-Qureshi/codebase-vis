#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
const { version } = createRequire(import.meta.url)('../package.json');
import { initCommand, generateCommand, cleanCommand, serveCommand, queryCommand, pathCommand, explainCommand } from '../src/cli/commands/index.js';

const program = new Command();

program
  .name('agent-context')
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

program.parse(process.argv);
