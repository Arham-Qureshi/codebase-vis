import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { createOutDir, getOutDirPath, safeWriteFile } from '../utils/file-system.js';
import { discoverFiles } from '../utils/traversal.js';
import { detectTechStack } from '../parser/stack-detector.js';
import { parseFile } from '../parser/index.js';
import { buildGraph } from '../graph/builder.js';
import { exportGraphToJson } from '../graph/formatter.js';
import { getHtmlTemplate } from '../templates/graph-template.js';

// default conatined in agent ingore file
const DEFAULT_IGNORES = [
  'node_modules/',
  'dist/',
  'build/',
  '.git/',
  '.next/',
  'coverage/',
  '.env',
  'codebase-out/',
];

// init => sets up .agentignore in the user's project root
export async function initCommand() {
  const agentignorePath = path.resolve(process.cwd(), '.agentignore');

  p.intro(pc.bgCyan(pc.black(' agent-context init ')));

  try {
    await fs.access(agentignorePath);
    // file already exists
    p.log.warn(pc.yellow('.agentignore already exists. Aborting to prevent overwriting.'));
    p.outro(pc.dim('Edit the existing .agentignore file, then run ') + pc.cyan('agent-context generate'));
    return;
  } catch {
    // file does not exist — create it
  }

  const s = p.spinner();
  s.start('Creating .agentignore');

  const content = `# agent-context ignore file\n# Add paths below to exclude from parsing\n\n${DEFAULT_IGNORES.join('\n')}\n`;
  await fs.writeFile(agentignorePath, content, 'utf-8');

  s.stop(pc.green('.agentignore created successfully'));
  p.outro(pc.dim('Edit the file to customise, then run ') + pc.cyan('agent-context generate'));
}

// generate => the primary workhorse
export async function generateCommand(paths = [], options = {}) {
  console.clear();
  p.intro(pc.bgCyan(pc.black(' agent-context generate ')));

  // resolve target directories — default to cwd if none specified
  const targetDirs = paths.length > 0
    ? paths.map(p => path.resolve(process.cwd(), p))
    : [process.cwd()];

  // parse --ignore flag into an array
  const customIgnores = options.ignore
    ? options.ignore.split(',').map(s => s.trim())
    : [];

  const s = p.spinner();

  s.start('Setting up output directory');
  const outDir = await createOutDir();
  s.stop(pc.green(`Output directory ready at ${pc.bold(outDir)}`));

  // Detecting tech stack
  s.start('Detecting tech stack...');
  const stack = await detectTechStack(process.cwd());
  s.stop(pc.green(`Tech stack detected: ${pc.bold(stack.type)}`));

  s.start('Discovering files...');
  const files = [];
  for (const dir of targetDirs) {
    const found = await discoverFiles(dir, customIgnores);
    files.push(...found);
  }
  s.stop(pc.green(`Found ${pc.bold(files.length)} files`));

  // Parsing AST and extracting dependencies
  s.start('Parsing AST and extracting dependencies...');
  const parsedData = [];
  for (const file of files) {
    const result = await parseFile(file);
    if (result) parsedData.push(result);
  }
  s.stop(pc.green(`Parsed ${pc.bold(parsedData.length)} files successfully`));

  s.start('Building dependency graph...');
  const graph = buildGraph(parsedData);
  s.stop(pc.green(`Graph built: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  s.start('Writing graph.json...');
  await exportGraphToJson(graph, outDir);
  s.stop(pc.green('graph.json written to codebase-out/'));

  s.start('Generating HTML visualizer...');
  const html = getHtmlTemplate();
  const htmlPath = path.join(outDir, 'graph.html');
  await safeWriteFile(htmlPath, html);
  s.stop(pc.green('graph.html generated in codebase-out/'));

  p.log.info(pc.dim(`Parsed data length: ${parsedData.length}`));

  p.outro(pc.green('✔') + pc.dim(' Generation complete. Run ') + pc.cyan('agent-context serve') + pc.dim(' to view.'));
}

// clean => safely deletes the codebase-out/ directory after confirmation
export async function cleanCommand() {
  p.intro(pc.bgRed(pc.white(' agent-context clean ')));

  const outDir = getOutDirPath();

  const shouldDelete = await p.confirm({
    message: `Are you sure you want to delete the ${pc.bold('codebase-out/')} directory?`,
  });

  // user cancelled (ctrl+c) or said no
  if (p.isCancel(shouldDelete) || !shouldDelete) {
    p.outro(pc.dim('Clean cancelled. No files were deleted.'));
    return;
  }

  const s = p.spinner();
  s.start('Deleting codebase-out/');

  await fs.rm(outDir, { recursive: true, force: true });

  s.stop(pc.green('codebase-out/ deleted successfully'));
  p.outro(pc.green('✔') + pc.dim(' Clean complete.'));
}

// MIME type lookup for the static file server
const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

// serve => spins up a local HTTP server to view the generated graph
export async function serveCommand(options = {}) {
  const port = parseInt(options.port, 10) || 3000;
  const outDir = getOutDirPath();

  p.intro(pc.bgMagenta(pc.white(' agent-context serve ')));

  try {
    await fs.access(outDir);
  } catch {
    p.log.error(pc.red('codebase-out/ not found. Run ') + pc.cyan('agent-context generate') + pc.red(' first.'));
    p.outro(pc.dim('Nothing to serve.'));
    return;
  }

  const server = http.createServer(async (req, res) => {
    const urlPath = req.url === '/' ? '/graph.html' : req.url;
    const filePath = path.join(outDir, urlPath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      p.log.error(pc.red(`Port ${port} is already in use. Try a different port with `) + pc.cyan(`--port <number>`));
      p.outro(pc.dim('Server could not start.'));
    } else {
      p.log.error(pc.red(`Server error: ${err.message}`));
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    p.log.success(pc.green(`Server running at ${pc.bold(url)}`));
    p.log.info(pc.dim('Press Ctrl+C to stop the server.'));

    // auto-open browser 
    const platform = process.platform;
    const openCmd = platform === 'darwin' ? 'open'
      : platform === 'win32' ? 'start'
        : 'xdg-open';

    exec(`${openCmd} ${url}`, () => {
    });
  });
}