#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand, generateCommand, cleanCommand, serveCommand, queryCommand, pathCommand, explainCommand } from '../src/cli/commands/index.js';

const program = new Command();

program
  .name('agent-context')
  .version('1.3.1')
  .description('A local CLI tool that parses codebases, builds dependency graphs, and outputs interactive architecture visualizations.');

program
  .command('init')
  .description('Create a boilerplate .agentignore file in the current directory')
  .action(initCommand);

program
  .command('generate [paths...]')
  .description('Parse the codebase (or specific paths) and generate the dependency graph')
  .option('--ignore <paths>', 'Comma-separated list of additional directories to skip')
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
  .action(explainCommand);

program.parse(process.argv);
