import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';
import { createOutDir, safeWriteFile } from '../../utils/file-system.js';
import { discoverFiles } from '../../utils/traversal.js';
import { detectTechStack } from '../../parser/stack-detector.js';
import { parseFileBatch } from '../../parser/index.js';
import { buildGraph } from '../../graph/builder.js';
import { exportGraphToJson } from '../../graph/formatter.js';
import { getHtmlTemplate } from '../../templates/graph-template.js';
import { loadCache, saveCache, splitFilesByCache, getStalePaths, buildUpdatedCache } from '../../utils/cache.js';

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

export async function generateCommand(paths = [], options = {}) {
  if (options.clear !== false) console.clear();
  p.intro(pc.bgCyan(pc.black(' codebase-vis generate ')));

  let cwdReal;
  try { cwdReal = await fs.realpath(process.cwd()) + path.sep; } catch { cwdReal = process.cwd() + path.sep; }
  const targetDirs = paths.length > 0
    ? paths.map(p => {
        const resolved = path.resolve(process.cwd(), p);
        if (!resolved.startsWith(cwdReal) && resolved !== cwdReal.slice(0, -1)) {
          p.log?.warn?.(pc.yellow(`Skipping path outside cwd: ${path.relative(process.cwd(), resolved)}`));
          return null;
        }
        return resolved;
      }).filter(Boolean)
    : [process.cwd()];
  if (paths.length > 0 && targetDirs.length === 0) {
    p.log.error(pc.red('No valid paths inside current directory.'));
    p.outro(pc.dim('Generation cancelled.'));
    return;
  }

  const s = p.spinner();

  s.start('Setting up output directory');
  const outDir = await createOutDir();
  try {
    const templateDir = path.dirname(fileURLToPath(import.meta.url));
    const vendorSrc = path.join(templateDir, '..', '..', 'templates', 'graph', 'vendor', 'd3.v7.min.js');
    const vendorDstDir = path.join(outDir, 'vendor');
    await fs.mkdir(vendorDstDir, { recursive: true });
    const buf = await fs.readFile(vendorSrc);
    await fs.writeFile(path.join(vendorDstDir, 'd3.v7.min.js'), buf);
  } catch {}
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

  const extraExcludes = [];
  if (options.excludeTests) extraExcludes.push('test/**');
  if (options.excludeDocs) extraExcludes.push('**/*.md', '**/*.mdx', 'docs/**');
  if (options.excludeDummy) extraExcludes.push('dummy-polyglot/**');
  if (options.excludeImages) extraExcludes.push('**/*.png','**/*.jpg','**/*.jpeg','**/*.gif','**/*.svg','**/*.ico','**/*.webp');

  const ig = ignore().add([...agentignorePatterns, ...extraExcludes, ...cliIgnores]);

  s.start('Discovering files...');
  const files = [];
  let ignoredCount = 0;
  for (const dir of targetDirs) {
    const result = await discoverFiles(dir, ig);
    files.push(...result.files);
    ignoredCount += result.ignoredCount;
  }

  let detail = `${pc.bold(files.length)} files`;
  if (ignoredCount > 0) detail += `, ${pc.dim(ignoredCount + ' ignored')}`;
  s.stop(pc.green(`Found ${detail}`));

  if (files.length > 1000) {
    p.log.message(pc.yellow(`⚡ Tip: Large codebase detected (${files.length} files). Use --depth 2 for faster generation.`));
  }

  s.start('Checking file cache...');
  const cache = await loadCache(outDir);
  const discoveredSet = new Set(files);

  let allParsed = [];
  let parseErrors = [];
  let toParse = files;
  let cachedResults = [];
  let stalePaths = [];
  let cachedCount = 0;

  if (cache) {
    const split = await splitFilesByCache(files, cache);
    toParse = split.toParse;
    cachedResults = split.cachedResults;
    stalePaths = getStalePaths(cache, discoveredSet);
    cachedCount = cachedResults.length;

    for (const r of cachedResults) {
      if (r && !r.error) allParsed.push(r);
    }

    if (options.verbose && cachedResults.length > 0) {
      for (const r of cachedResults) {
        if (r && r.id) {
          p.log.message(pc.dim(`  [cached] ${path.relative(process.cwd(), r.id)}`));
        }
      }
    }
  }

  let freshResults = [];
  if (toParse.length > 0) {
    s.message(cache ? `Parsing ${toParse.length} changed file(s)...` : 'Parsing files...');
    const cpuCores = os.cpus().length;
    const maxWorkers = Math.max(cpuCores, 4);
    let numJobs = options.jobs ? Number(options.jobs) : undefined;
    if (numJobs !== undefined) {
      if (isNaN(numJobs) || numJobs < 1) {
        numJobs = undefined;
      } else if (numJobs > maxWorkers) {
        p.log.warn(pc.yellow(`--jobs capped to ${maxWorkers} (requested: ${numJobs}). Max recommended is ${cpuCores}.`));
        numJobs = maxWorkers;
      }
    }
    freshResults = await parseFileBatch(toParse, (done, total) => {
      s.message(`Parsing files... ${done}/${total}`);
    }, numJobs);

    for (const result of freshResults) {
      if (result && !result.error) {
        allParsed.push(result);
      } else if (options.verbose) {
        parseErrors.push(result?.id || 'unknown');
      }
    }

    if (options.verbose && freshResults.length > 0) {
      for (const result of freshResults) {
        if (result && result.id && !result.error) {
          p.log.message(pc.dim(`  [parsed] ${path.relative(process.cwd(), result.id)}`));
        }
      }
    }
  }

  if (cache) {
    s.stop(pc.green(`Files ready — ${pc.bold(toParse.length)} parsed, ${pc.bold(cachedCount)} from cache${stalePaths.length ? `, ${pc.dim(stalePaths.length + ' stale removed')}` : ''}`));
  } else {
    s.stop(pc.green(`Parsed ${pc.bold(allParsed.length)} files successfully`));
  }

  if (parseErrors.length > 0) {
    const hint = options.verbose ? '' : ' Use --verbose to see details.';
    p.log.warn(pc.yellow(`${parseErrors.length} file(s) failed to parse.${hint}`));
  }
  if (options.verbose && parseErrors.length > 0) {
    for (const file of parseErrors) {
      p.log.warn(pc.dim(`  ${path.relative(process.cwd(), file)}`));
    }
  }

  s.start('Building dependency graph...');
  const depth = options.depth ? parseInt(options.depth, 10) : 3;
  if (isNaN(depth) || depth < 1 || depth > 5) {
    p.log.warn(pc.yellow('Invalid depth. Using default (3).'));
  }
  const graph = buildGraph(allParsed, { depth: isNaN(depth) || depth < 1 || depth > 5 ? 3 : depth });
  s.stop(pc.green(`Graph built: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  s.start('Writing graph.json...');
  await exportGraphToJson(graph, outDir);
  s.stop(pc.green('graph.json written to codebase-out/'));

  s.start('Generating HTML visualizer...');
  const html = await getHtmlTemplate();
  const htmlPath = path.join(outDir, 'graph.html');
  await safeWriteFile(htmlPath, html);
  s.stop(pc.green('graph.html generated in codebase-out/'));

  s.start('Saving file cache...');
  const updatedCache = await buildUpdatedCache(cache || {}, toParse, freshResults, stalePaths);
  await saveCache(outDir, updatedCache);
  s.stop(pc.green('Cache saved'));

  p.outro(pc.green('✔') + pc.dim(' Generation complete. Run ') + pc.cyan('codebase-vis serve') + pc.dim(' to view.'));
}