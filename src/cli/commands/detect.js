import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import Graph from 'graphology';
import { loadGraph, toRelative } from '../shared.js';
import { detectCycles, enrichCycles } from '../../graph/cycle-detector.js';
import { getOutDirPath } from '../../utils/file-system.js';

const CYCLES_FILENAME = 'cycles.json';

export async function detectCommand() {
  p.intro(pc.bgCyan(pc.black(' codebase-vis detect ')));

  const s = p.spinner();
  s.start('Loading graph');

  try {
    const graph = await loadGraph();
    if (!graph) {
      s.stop(pc.red('graph.json not found'));
      p.log.error(
        pc.red('Run ') + pc.cyan('codebase-vis generate') + pc.red(' first.')
      );
      p.outro(pc.dim('Nothing to analyze.'));
      return;
    }
    s.stop(pc.green(`Graph loaded: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

    s.start('Detecting cycles');
    const cycles = detectCycles(graph);
    const enriched = enrichCycles(graph, cycles);
    s.stop(pc.green(`Cycle detection complete`));

    if (cycles.length >= 200) {
      p.log.warn(pc.yellow(`Found ${pc.bold(200)}+ cycles. Showing first 200.`));
    }

    const outDir = getOutDirPath();
    const cyclesPath = path.join(outDir, CYCLES_FILENAME);
    await fs.writeFile(cyclesPath, JSON.stringify(enriched, null, 2), 'utf-8');

    p.log.message('');

    if (enriched.length === 0) {
      p.log.success(pc.green('No cycles detected.'));
      p.log.success(pc.green('Empty cycles.json written to ') + pc.cyan(path.relative(process.cwd(), cyclesPath)));
      p.outro(pc.dim('Your dependency graph is acyclic.'));
      return;
    }

    p.log.warn(pc.yellow(`⚠  ${pc.bold(enriched.length)} cycle${enriched.length > 1 ? 's' : ''} detected:`));
    p.log.message('');

    for (const c of enriched) {
      const label = `Cycle #${c.id}  ${pc.dim(`(${c.size} files)`)}`;
      p.log.message(pc.bold(label));

      const chain = c.files.map((f, i) => {
        const rel = toRelative(f.id);
        return i === 0 ? `  ${pc.cyan(rel)}` : `  ${pc.dim('→')} ${pc.cyan(rel)}`;
      }).join('\n');

      p.log.message(chain);
      p.log.message('');
    }

    const relCycles = path.relative(process.cwd(), cyclesPath);
    p.log.success(pc.green('Cycles written to ') + pc.cyan(relCycles));
    p.log.info(pc.dim('Open ') + pc.cyan('graph.html') + pc.dim(' and click "Show Cycles" to visualize.'));
  } catch (err) {
    s.stop(pc.red('Error'));
    p.log.error(pc.red(`Detection failed: ${err.message}`));
  }

  p.outro(pc.green('✔') + pc.dim(' Detection complete.'));
}