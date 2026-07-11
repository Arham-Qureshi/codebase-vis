import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs/promises';
import ignore from 'ignore';
import { createOutDir, safeWriteFile } from '../../utils/file-system.js';
import { discoverFiles } from '../../utils/traversal.js';
import { detectTechStack } from '../../parser/stack-detector.js';
import { parseFileBatch } from '../../parser/index.js';
import { buildGraph } from '../../graph/builder.js';
import { exportGraphToJson } from '../../graph/formatter.js';
import { getHtmlTemplate } from '../../templates/graph-template.js';

const HARDCODED_IGNORES = [
  '.git',
  'codebase-out',
  '.env',
  'node_modules',
  '.agentignore',
  '.gitignore',
  '.npmignore',
  '.dockerignore',
  '.opencode',
  '.agents',
  '.github',
  'LICENSE',
  'LICENSE.md',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'to-be-done-fix',
  'to-be-done-*',
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
  node: ['node_modules', 'dist', 'build', '.next'],
  nextjs: ['node_modules', 'dist', 'build', '.next'],
  react: ['node_modules', 'dist', 'build'],
  python: ['venv', '__pycache__', '.pytest_cache', '*.pyc', 'dist', 'build'],
  cpp: ['build', 'cmake-build-*', '.vscode'],
};

async function readAgentignore(rootDir) {
  try {
    const raw = await fs.readFile(path.join(rootDir, '.agentignore'), 'utf8');
    return raw.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function buildIgnoreInstance(hardcoded, dynamic, nonCode, agentignore, cliIgnores) {
  const ig = ignore().add([...hardcoded, ...dynamic, ...nonCode, ...agentignore, ...cliIgnores]);
  return ig;
}

export async function generateCommand(paths = [], options = {}) {
  if (options.clear !== false) console.clear();
  p.intro(pc.bgCyan(pc.black(' codebase-vis generate ')));

  const targetDirs = paths.length > 0
    ? paths.map(p => path.resolve(process.cwd(), p))
    : [process.cwd()];

  const s = p.spinner();

  s.start('Setting up output directory');
  const outDir = await createOutDir();
  s.stop(pc.green(`Output directory ready at ${pc.bold(outDir)}`));

  s.start('Detecting tech stack...');
  const stack = await detectTechStack(process.cwd());
  s.stop(pc.green(`Tech stack detected: ${pc.bold(stack.type)}`));

  s.start('Reading .agentignore...');
  const agentignorePatterns = await readAgentignore(process.cwd());
  s.stop(pc.green(`.agentignore loaded (${agentignorePatterns.length} patterns)`));

  const cliIgnores = options.ignore
    ? options.ignore.split(',').map(s => s.trim())
    : [];

  const dynamicIgnores = STACK_IGNORES[stack.type] || [];
  const ig = buildIgnoreInstance(HARDCODED_IGNORES, dynamicIgnores, NON_CODE_PATTERNS, agentignorePatterns, cliIgnores);

  s.start('Discovering files...');
  const files = [];
  for (const dir of targetDirs) {
    const found = await discoverFiles(dir, ig);
    files.push(...found);
  }
  s.stop(pc.green(`Found ${pc.bold(files.length)} files`));

  const allResults = await parseFileBatch(files, (done, total) => {
    s.message(`Parsing files... ${done}/${total}`);
  }, options.jobs ? Number(options.jobs) : undefined);
  const parsedData = [];
  const errors = [];
  for (const result of allResults) {
    if (result && !result.error) {
      parsedData.push(result);
    } else if (options.verbose) {
      errors.push(result.id);
    }
  }
  s.stop(pc.green(`Parsed ${pc.bold(parsedData.length)} files successfully`));
  if (errors.length > 0) {
    p.log.warn(pc.yellow(`${errors.length} file(s) failed to parse. Use --verbose to see details.`));
  }
  if (options.verbose && errors.length > 0) {
    for (const file of errors) {
      p.log.warn(pc.dim(`  ${path.relative(process.cwd(), file)}`));
    }
  }

  s.start('Building dependency graph...');
  const graph = buildGraph(parsedData);
  s.stop(pc.green(`Graph built: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  s.start('Writing graph.json...');
  await exportGraphToJson(graph, outDir);
  s.stop(pc.green('graph.json written to codebase-out/'));

  s.start('Generating HTML visualizer...');
  const html = await getHtmlTemplate();
  const htmlPath = path.join(outDir, 'graph.html');
  await safeWriteFile(htmlPath, html);
  s.stop(pc.green('graph.html generated in codebase-out/'));

  p.log.info(pc.dim(`Parsed data length: ${parsedData.length}`));

  p.outro(pc.green('✔') + pc.dim(' Generation complete. Run ') + pc.cyan('codebase-vis serve') + pc.dim(' to view.'));
}