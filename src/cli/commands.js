import * as p from '@clack/prompts';
import pc from 'picocolors';
import Graph from 'graphology';
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

// Convert an absolute node ID to a project-relative path
function toRelative(nodeId) {
  return path.relative(process.cwd(), nodeId) || nodeId;
}

// color based on its type that is (blue-> file,yellow-> package,magenta-> entity)
function formatNodeLabel(nodeId, attrs) {
  if (attrs.external) return pc.yellow(nodeId);
  if (attrs.kind === 'entity') return pc.magenta(attrs.label || nodeId);
  return pc.cyan(toRelative(nodeId));
}

// query => look up a node's dependencies and dependents 
export async function queryCommand(target) {
  p.intro(pc.bgCyan(pc.black(' agent-context query ')));

  // Load graph.json
  const graphPath = path.join(getOutDirPath(), 'graph.json');
  try {
    await fs.access(graphPath);
  } catch {
    p.log.error(
      pc.red('graph.json not found. Run ') +
      pc.cyan('agent-context generate') +
      pc.red(' first.')
    );
    p.outro(pc.dim('Nothing to query.'));
    return;
  }

  const s = p.spinner();
  s.start('Loading graph');

  const raw = await fs.readFile(graphPath, 'utf-8');
  const graph = new Graph({ multi: true, directed: true });
  graph.import(JSON.parse(raw));

  s.stop(pc.green(`Graph loaded: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  // exact match first, then partial
  let nodeId = null;

  if (graph.hasNode(target)) {
    nodeId = target;
  } else {
    // Try resolving as a path relative to cwd
    const resolved = path.resolve(process.cwd(), target);
    if (graph.hasNode(resolved)) {
      nodeId = resolved;
    }
  }

  if (!nodeId) {
    const query = target.toLowerCase();
    const matches = [];
    graph.forEachNode((id, attrs) => {
      const label = (attrs.label || id).toLowerCase();
      if (id.toLowerCase().includes(query) || label.includes(query)) {
        matches.push({ id, label: attrs.label || id });
      }
    });

    if (matches.length === 0) {
      p.log.error(pc.red(`No node found matching "${pc.bold(target)}".`));
      p.outro(pc.dim('Try a different search term.'));
      return;
    }

    if (matches.length === 1) {
      nodeId = matches[0].id;
    } else {
      // Let the user pick from the matches
      const selected = await p.select({
        message: `Multiple matches for "${target}". Select a node:`,
        options: matches.slice(0, 25).map(m => ({
          value: m.id,
          label: m.label,
          hint: m.id !== m.label ? pc.dim(toRelative(m.id)) : undefined,
        })),
      });

      if (p.isCancel(selected)) {
        p.outro(pc.dim('Query cancelled.'));
        return;
      }

      nodeId = selected;
    }
  }

  const attrs = graph.getNodeAttributes(nodeId);
  const relPath = toRelative(nodeId);
  const displayLabel = attrs.label || path.basename(nodeId);

  p.log.info(
    pc.bold(pc.white(displayLabel)) +
    pc.dim(relPath !== displayLabel ? `  ${relPath}` : '')
  );

  if (attrs.community) {
    p.log.message(pc.dim('Module: ') + pc.white(attrs.community));
  }

  const dependencies = [];
  const dependents = [];

  graph.forEachOutNeighbor(nodeId, (neighbor, neighborAttrs) => {
    dependencies.push({ id: neighbor, attrs: neighborAttrs });
  });

  graph.forEachInNeighbor(nodeId, (neighbor, neighborAttrs) => {
    dependents.push({ id: neighbor, attrs: neighborAttrs });
  });

  // Deduplicate (multi-graph may have parallel edges)
  const dedup = (list) => {
    const seen = new Set();
    return list.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const uniqueDeps = dedup(dependencies);
  const uniqueDependent = dedup(dependents);

  // Print dependencies (outbound)
  const sectionSep = pc.dim('─'.repeat(44));

  p.log.message('');
  p.log.message(sectionSep);
  p.log.message(pc.bold(pc.green(`  ↓ Dependencies (${uniqueDeps.length})`)));
  p.log.message(sectionSep);

  if (uniqueDeps.length === 0) {
    p.log.message(pc.dim('  No dependencies.'));
  } else {
    for (const dep of uniqueDeps) {
      const icon = dep.attrs.external ? pc.yellow('◆') :
        dep.attrs.kind === 'entity' ? pc.magenta('◇') :
          pc.cyan('●');
      p.log.message(`  ${icon} ${formatNodeLabel(dep.id, dep.attrs)}`);
    }
  }

  // Print dependents (inbound)
  p.log.message('');
  p.log.message(sectionSep);
  p.log.message(pc.bold(pc.red(`  ↑ Dependents (${uniqueDependent.length})`)));
  p.log.message(sectionSep);

  if (uniqueDependent.length === 0) {
    p.log.message(pc.dim('  No dependents.'));
  } else {
    for (const dep of uniqueDependent) {
      const icon = dep.attrs.external ? pc.yellow('◆') :
        dep.attrs.kind === 'entity' ? pc.magenta('◇') :
          pc.cyan('●');
      p.log.message(`  ${icon} ${formatNodeLabel(dep.id, dep.attrs)}`);
    }
  }

  p.log.message('');
  p.log.message(
    pc.dim('  Legend: ') +
    pc.cyan('● file') + pc.dim(' · ') +
    pc.yellow('◆ package') + pc.dim(' · ') +
    pc.magenta('◇ entity')
  );

  p.outro(pc.green('✔') + pc.dim(' Query complete.'));
}