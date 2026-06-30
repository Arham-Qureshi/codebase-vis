#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('agent-context')
  .version('1.0.0')
  .description('A local CLI tool that parses codebases, builds dependency graphs, and outputs interactive architecture visualizations.');

program.parse(process.argv);
