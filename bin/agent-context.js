#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand, generateCommand, cleanCommand } from '../src/cli/commands.js';

const program = new Command();

program
  .name('agent-context')
  .version('1.0.0')
  .description('A local CLI tool that parses codebases, builds dependency graphs, and outputs interactive architecture visualizations.');

program
  .command('init')
  .description('Create a boilerplate .agentignore file in the current directory')
  .action(initCommand);

program
  .command('generate')
  .description('Parse the codebase and generate the dependency graph')
  .action(generateCommand);

program
  .command('clean')
  .description('Delete the generated codebase-out/ directory')
  .action(cleanCommand);

program.parse(process.argv);
