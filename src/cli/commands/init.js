import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectTechStack } from '../../parser/stack-detector.js';

const COMMON_IGNORES = [
  '.git',
  'codebase-out',
  '.env',
  '.env.local',
  '.env.*.local',
];

const NON_CODE_PATTERNS = [
  '*.txt',
  '*.md',
  '*.json',
  '*.yaml',
  '*.yml',
  '*.toml',
  '*.cfg',
  '*.ini',
  '*.log',
  '*.csv',
  '*.svg',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.woff',
  '*.woff2',
  '*.eot',
  '*.ttf',
  '*.otf',
  '*.pdf',
];

const STACK_IGNORES = {
  node: ['node_modules/', 'dist/', 'build/', '.next/'],
  nextjs: ['node_modules/', 'dist/', 'build/', '.next/'],
  angular: ['node_modules/', 'dist/', 'build/'],
  react: ['node_modules/', 'dist/', 'build/'],
  python: ['venv/', '__pycache__/', '.pytest_cache/', '*.pyc', 'dist/', 'build/'],
  cpp: ['build/', 'cmake-build-*/', '.vscode/'],
  rust: ['target/'],
  go: [],
  php: ['vendor/'],
  ruby: ['vendor/bundle/'],
  java: ['build/', '.gradle/'],
};

function getStackIgnores(stackType) {
  return STACK_IGNORES[stackType] || [];
}

export async function initCommand() {
  const agentignorePath = path.resolve(process.cwd(), '.agentignore');

  p.intro(pc.bgCyan(pc.black(' codebase-vis init ')));

  try {
    await fs.access(agentignorePath);
    p.log.warn(pc.yellow('.agentignore already exists. Aborting to prevent overwriting.'));
    p.outro(pc.dim('Edit the existing .agentignore file, then run ') + pc.cyan('codebase-vis generate'));
    return;
  } catch {
  }

  const s = p.spinner();
  s.start('Detecting tech stack...');
  const stack = await detectTechStack(process.cwd());
  s.stop(pc.green(`Tech stack detected: ${pc.bold(stack.type)}`));

  const stackIgnores = getStackIgnores(stack.type);

  const lines = [
    '# codebase-vis ignore file',
    '# Add paths below to exclude from parsing',
    '',
    '# --- Non-code files ---',
    '*.txt',
    '*.md',
    '*.json',
    '*.yaml',
    '*.yml',
    '*.toml',
    '*.cfg',
    '*.ini',
    '*.log',
    '*.csv',
    '*.svg',
    '*.png',
    '*.jpg',
    '*.jpeg',
    '*.gif',
    '*.ico',
    '*.woff',
    '*.woff2',
    '*.eot',
    '*.ttf',
    '*.otf',
    '*.pdf',
    '',
    '# --- Config / planning directories ---',
    '.agents/',
    '.opencode/',
    '.agentignore',
    '',
    '# --- Version control ---',
    '.git/',
    '',
    '# --- Output ---',
    'codebase-out/',
    '',
    '# --- Environment ---',
    '.env',
    '.env.local',
    '.env.*.local',
    '',
    `# --- ${stack.type} project ---`,
    ...stackIgnores.map(i => i.endsWith('/') ? i : i + '/'),
    '',
    '# --- Add your custom patterns below ---',
  ];

  s.start('Creating .agentignore');

  const content = lines.join('\n') + '\n';
  await fs.writeFile(agentignorePath, content, 'utf-8');

  s.stop(pc.green('.agentignore created successfully'));
  p.log.warn(
    pc.bgYellow(pc.black(' NOTE: ')) +
    ' ' +
    pc.yellow('Review the file and remove any patterns for files that are not source code (e.g., docs, configs, assets) to reduce parsing overhead.')
  );
  p.outro(pc.dim('Edit the file to customise, then run ') + pc.cyan('codebase-vis generate'));
}
