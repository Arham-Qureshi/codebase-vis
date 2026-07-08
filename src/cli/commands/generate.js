import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import { createOutDir, safeWriteFile } from '../../utils/file-system.js';
import { discoverFiles } from '../../utils/traversal.js';
import { detectTechStack } from '../../parser/stack-detector.js';
import { parseFile } from '../../parser/index.js';
import { buildGraph } from '../../graph/builder.js';
import { exportGraphToJson } from '../../graph/formatter.js';
import { getHtmlTemplate } from '../../templates/graph-template.js';

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