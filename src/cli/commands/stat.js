import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadGraph, resolveNode, toRelative, formatNodeLabel, resetTimer } from '../shared.js';
import { computeGlobalStats, computeTargetStats } from '../../utils/stat-calculator.js';
import { getOutDirPath } from '../../utils/file-system.js';

const CYCLES_FILENAME = 'cycles.json';
const SECTION_SEP = pc.dim('─'.repeat(44));
const MIN_COL_WIDTH = 85;

async function loadCycles() {
  try {
    const cyclesPath = path.join(getOutDirPath(), CYCLES_FILENAME);
    const raw = await fs.readFile(cyclesPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stripAnsi(s) {
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function padVisible(s, width) {
  const visible = stripAnsi(s);
  const padLen = Math.max(0, width - visible.length);
  return s + ' '.repeat(padLen);
}

function getTerminalWidth() {
  return process.stdout.columns || Number(process.env.COLUMNS) || 80;
}

function useColumns() {
  return getTerminalWidth() >= MIN_COL_WIDTH;
}

function getColWidths(totalWidth, count, weights) {
  const padding = 3;
  const avail = totalWidth - (padding * (count - 1));

  if (weights && weights.length === count) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let allocated = 0;
    const widths = [];
    for (let i = 0; i < count; i++) {
      const w = Math.floor(avail * (weights[i] / totalWeight));
      widths.push(w);
      allocated += w;
    }
    // Distribute remainder
    const rem = avail - allocated;
    for (let i = 0; i < rem; i++) widths[i % count]++;
    return widths;
  }

  const base = Math.floor(avail / count);
  const rem = avail - base * count;
  const widths = [];
  for (let i = 0; i < count; i++) {
    widths.push(base + (i < rem ? 1 : 0));
  }
  return widths;
}

function renderColumns(sections, widths) {
  const maxH = Math.max(...sections.map(s => s.length));
  const rows = [];
  for (let i = 0; i < maxH; i++) {
    const parts = sections.map((s, ci) => {
      const line = i < s.length ? s[i] : '';
      return padVisible(line, widths[ci]);
    });
    rows.push(parts.join(' '.repeat(3)));
  }
  return rows;
}

function buildVertical(lines) {
  for (const line of lines) {
    p.log.message(line);
  }
}

// Global mode section builders

function buildCompositionLines(c) {
  const lines = [];
  lines.push(pc.bold(`  ── Composition ──`));
  lines.push(`  ${pc.bold('Source Files:')}     ${pc.white(c.fileNodes)}`);
  lines.push(`  ${pc.bold('Entities:')}          ${pc.white(c.entityNodes)}  ${pc.dim(`(${c.entityBreakdown.classes} classes, ${c.entityBreakdown.functions} functions, ${c.entityBreakdown.methods} methods)`)}`);
  lines.push(`  ${pc.bold('External Packages:')} ${pc.white(c.externalPackages)}  ${pc.dim(`(${c.npmPackages} npm)`)}`);
  lines.push(`  ${pc.bold('Communities:')}       ${pc.white(c.communities)}`);
  lines.push(`  ${pc.bold('Dep Edges:')}         ${pc.white(c.dependencyEdges)}`);
  if (c.crossCommunityEdges > 0) {
    lines.push(`  ${pc.bold('Cross-Module:')}      ${pc.white(c.crossCommunityEdges)}  ${pc.dim(`(${c.crossCommunityPct}%)`)}`);
  }
  return lines;
}

function buildLanguageLines(languages, communities) {
  const lines = [];
  lines.push(pc.bold(`  ── Languages ──`));
  if (languages.length === 0) {
    lines.push(`  ${pc.dim('No languages detected')}`);
    return lines;
  }

  const maxLangLen = Math.max(...languages.map(l => l.language.length), 9);
  const pad = (s, n) => s.padEnd(n);

  lines.push(`  ${pc.bold(pc.dim(pad('Language', maxLangLen + 2)))}${pc.bold(pc.dim('Files'))}    ${pc.bold(pc.dim('Deps'))}    ${pc.bold(pc.dim('Entities'))}`);

  for (const lang of languages) {
    const langStr = pc.bold(pad(lang.language, maxLangLen + 2));
    const files = pc.white(String(lang.files).padStart(5));
    const deps = pc.white(String(lang.totalDeps).padStart(5));
    const ents = pc.white(String(lang.entities).padStart(8));
    lines.push(`  ${langStr}${files}  ${deps}  ${ents}`);
  }

  if (communities.length > 0) {
    lines.push('');
    const maxCommLen = Math.max(...communities.map(c => c.name.length), 10);
    lines.push(`  ${pc.bold(pc.dim(pad('Community', maxCommLen + 2)))}${pc.bold(pc.dim('Files'))}`);
    for (const comm of communities) {
      lines.push(`  ${pc.bold(pad(comm.name, maxCommLen + 2))}${pc.white(String(comm.files).padStart(5))}`);
    }
  }

  return lines;
}

function buildHealthLines(health) {
  const lines = [];
  lines.push(pc.bold(`  ── Health ──`));
  lines.push(`  ${pc.bold('Avg Deps/File:')}   ${pc.white(health.avgDepsPerFile)}`);
  lines.push(`  ${pc.bold('Entity Density:')}   ${pc.white(health.entityDensity)}  ${pc.dim('entities/file')}`);
  lines.push(`  ${pc.bold('Max Dep Chain:')}    ${pc.white(health.maxDepChain)}  ${pc.dim('hops')}`);
  lines.push(`  ${pc.bold('Isolated Files:')}   ${pc.white(health.isolatedFiles)}`);
  if (health.circularDeps !== null) {
    const color = health.circularDeps > 0 ? pc.yellow : pc.green;
    lines.push(`  ${pc.bold('Circular Deps:')}    ${color(health.circularDeps)}  ${pc.dim(health.circularDeps > 0 ? "run 'codebase-vis detect' for details" : 'none detected')}`);
  }
  return lines;
}

function buildHotspotLines(hotspots, topN) {
  const lines = [];
  const topStr = topN === Infinity ? 'All' : topN;
  lines.push(pc.bold(`  ── Hotspots (Top ${topStr}) ──`));

  if (hotspots.mostImported.length > 0) {
    const items = hotspots.mostImported.map((item, i) => {
      const formatted = `${pc.cyan(item.label)}${pc.yellow(`(${item.dependents})`)}`;
      return `${pc.dim(`#${i + 1}`)} ${formatted}`;
    });
    lines.push(`  ${pc.bold(pc.cyan('Most Imported:'))}  ${items.join('  ')}`);
  }

  if (hotspots.heaviestImporters.length > 0) {
    const items = hotspots.heaviestImporters.map((item, i) => {
      const formatted = `${pc.green(item.label)}${pc.yellow(`(${item.dependencies})`)}`;
      return `${pc.dim(`#${i + 1}`)} ${formatted}`;
    });
    lines.push(`  ${pc.bold(pc.green('Heaviest Importers:'))}  ${items.join('  ')}`);
  }

  if (hotspots.largestFiles.length > 0) {
    const items = hotspots.largestFiles.map((item, i) => {
      const formatted = `${pc.magenta(item.label)}${pc.yellow(`(${item.entities})`)}`;
      return `${pc.dim(`#${i + 1}`)} ${formatted}`;
    });
    lines.push(`  ${pc.bold(pc.magenta('Largest (entities):'))}  ${items.join('  ')}`);
  }

  return lines;
}

/* ── Global mode renderers ── */

function renderGlobalColumns(stats) {
  const c = stats.composition;
  const comp = buildCompositionLines(c);
  const langs = buildLanguageLines(stats.languages, stats.communities);
  const health = buildHealthLines(stats.health);

  // Row 1: Composition + Languages (2 columns)
  const widths = getColWidths(getTerminalWidth() - 2, 2, [0.50, 0.50]);
  const topRows = renderColumns([comp, langs], widths);
  for (const row of topRows) {
    p.log.message(row);
  }

  // Row 2: Health (full-width)
  p.log.message('');
  buildVertical(health);
}

function renderGlobalVertical(stats, options) {
  const { verbose, topN } = options;
  const c = stats.composition;

  helpSection('Composition');
  p.log.message(`  ${pc.bold('Source Files:')}     ${pc.white(c.fileNodes)}`);
  p.log.message(`  ${pc.bold('Entities:')}          ${pc.white(c.entityNodes)}  ${pc.dim(`(${c.entityBreakdown.classes} classes, ${c.entityBreakdown.functions} functions, ${c.entityBreakdown.methods} methods)`)}`);
  p.log.message(`  ${pc.bold('External Packages:')} ${pc.white(c.externalPackages)}  ${pc.dim(`(${c.npmPackages} npm)`)}`);
  p.log.message(`  ${pc.bold('Communities:')}       ${pc.white(c.communities)}  ${pc.dim('Louvain modules')}`);
  p.log.message(`  ${pc.bold('Dep Edges:')}         ${pc.white(c.dependencyEdges)}`);

  if (c.crossCommunityEdges > 0) {
    p.log.message(`  ${pc.bold('Cross-Module:')}      ${pc.white(c.crossCommunityEdges)}  ${pc.dim(`(${c.crossCommunityPct}% of file-to-file edges)`)}`);
  }

  if (stats.languages.length > 0) {
    helpSection('Languages');

    const maxLangLen = Math.max(...stats.languages.map(l => l.language.length), 9);
    const pad = (s, n) => s.padEnd(n);

    p.log.message(`  ${pc.bold(pc.dim(pad('Language', maxLangLen + 2)))}${pc.bold(pc.dim('Files'))}    ${pc.bold(pc.dim('Deps'))}    ${pc.bold(pc.dim('Entities'))}`);

    for (const lang of stats.languages) {
      const langStr = pc.bold(pad(lang.language, maxLangLen + 2));
      const files = pc.white(String(lang.files).padStart(5));
      const deps = pc.white(String(lang.totalDeps).padStart(5));
      const ents = pc.white(String(lang.entities).padStart(8));
      p.log.message(`  ${langStr}${files}  ${deps}  ${ents}`);
    }

    if (stats.communities.length > 0) {
      p.log.message('');
      const maxCommLen = Math.max(...stats.communities.map(c => c.name.length), 10);
      p.log.message(`  ${pc.bold(pc.dim(pad('Community', maxCommLen + 2)))}${pc.bold(pc.dim('Files'))}`);
      for (const comm of stats.communities) {
        p.log.message(`  ${pc.bold(pad(comm.name, maxCommLen + 2))}${pc.white(String(comm.files).padStart(5))}`);
      }
    }
  }

  const hasHotspots = stats.hotspots.mostImported.length > 0
    || stats.hotspots.heaviestImporters.length > 0
    || stats.hotspots.largestFiles.length > 0;

  if (hasHotspots) {
    helpSection(`Hotspots (Top ${topN === Infinity ? 'All' : topN})`);

    if (stats.hotspots.mostImported.length > 0) {
      p.log.message(`  ${pc.bold(pc.cyan('Most Imported:'))}`);
      for (const item of stats.hotspots.mostImported) {
        const rel = formatRelPath(item.id);
        p.log.message(`    ${pc.dim(`#${stats.hotspots.mostImported.indexOf(item) + 1}`)}  ${pc.cyan(item.label)}  ${rel}`);
        p.log.message(`         ${pc.yellow(`← ${item.dependents} dependents`)}`);
      }
      p.log.message('');
    }

    if (stats.hotspots.heaviestImporters.length > 0) {
      p.log.message(`  ${pc.bold(pc.green('Heaviest Importers:'))}`);
      for (const item of stats.hotspots.heaviestImporters) {
        const rel = formatRelPath(item.id);
        p.log.message(`    ${pc.dim(`#${stats.hotspots.heaviestImporters.indexOf(item) + 1}`)}  ${pc.green(item.label)}  ${rel}`);
        p.log.message(`         ${pc.yellow(`→ ${item.dependencies} deps`)}`);
      }
      p.log.message('');
    }

    if (stats.hotspots.largestFiles.length > 0) {
      p.log.message(`  ${pc.bold(pc.magenta('Largest (by entities):'))}`);
      for (const item of stats.hotspots.largestFiles) {
        const rel = formatRelPath(item.id);
        p.log.message(`    ${pc.dim(`#${stats.hotspots.largestFiles.indexOf(item) + 1}`)}  ${pc.magenta(item.label)}  ${rel}`);
        p.log.message(`         ${pc.yellow(`${item.entities} entities`)}`);
      }
    }
  }

  helpSection('Health');
  p.log.message(`  ${pc.bold('Avg Deps/File:')}   ${pc.white(stats.health.avgDepsPerFile)}`);
  p.log.message(`  ${pc.bold('Entity Density:')}   ${pc.white(stats.health.entityDensity)}  ${pc.dim('entities/file')}`);
  p.log.message(`  ${pc.bold('Max Dep Chain:')}    ${pc.white(stats.health.maxDepChain)}  ${pc.dim('hops')}`);
  p.log.message(`  ${pc.bold('Isolated Files:')}   ${pc.white(stats.health.isolatedFiles)}  ${pc.dim('0 deps, 0 dependents')}`);

  if (stats.health.circularDeps !== null) {
    const color = stats.health.circularDeps > 0 ? pc.yellow : pc.green;
    p.log.message(`  ${pc.bold('Circular Deps:')}    ${color(stats.health.circularDeps)}  ${pc.dim(stats.health.circularDeps > 0 ? "run 'codebase-vis detect' for details" : 'none detected')}`);
  }

  if (verbose && stats.health.isolatedList && stats.health.isolatedList.length > 0) {
    p.log.message('');
    p.log.message(`  ${pc.dim('Isolated files:')}`);
    for (const file of stats.health.isolatedList) {
      p.log.message(`    ${pc.dim('•')} ${pc.dim(toRelative(file))}`);
    }
  }
}

function helpSection(title) {
  p.log.message('');
  p.log.message(SECTION_SEP);
  p.log.message(pc.bold(`  ${title}`));
  p.log.message(SECTION_SEP);
}

function renderGlobalStats(stats, options) {
  const useCols = useColumns();

  if (useCols) {
    renderGlobalColumns(stats);

    // Hotspots full-width below columns
    const hasHotspots = stats.hotspots.mostImported.length > 0
      || stats.hotspots.heaviestImporters.length > 0
      || stats.hotspots.largestFiles.length > 0;

    if (hasHotspots) {
      const topN = options.topN;
      const lines = buildHotspotLines(stats.hotspots, topN);
      p.log.message('');
      p.log.message(SECTION_SEP);
      buildVertical(lines);
    }
  } else {
    renderGlobalVertical(stats, options);
  }

  // Verbose isolated list in vertical mode is inside renderGlobalVertical
  // In columns mode, show it here if verbose
  if (useCols && options.verbose && stats.health.isolatedList && stats.health.isolatedList.length > 0) {
    p.log.message(`  ${pc.dim('Isolated files:')}`);
    for (const file of stats.health.isolatedList) {
      p.log.message(`    ${pc.dim('•')} ${pc.dim(toRelative(file))}`);
    }
  }
}

/* ── Target mode ── */

function buildTargetFileLines(stats) {
  const relPath = toRelative(stats.id);
  const label = stats.label;

  const col1 = [];
  col1.push(pc.bold(`  ── ${label} ──`));
  if (relPath !== label) col1.push(`  ${pc.dim(relPath)}`);
  col1.push(`  ${pc.bold('Language:')}    ${pc.white(stats.language || 'Unknown')}`);
  col1.push(`  ${pc.bold('Community:')}   ${pc.white(stats.community || '—')}`);
  col1.push(`  ${pc.bold('Degree:')}      ${pc.cyan(`in=${stats.degree.in}`)}  ${pc.red(`out=${stats.degree.out}`)}  ${pc.white(`total=${stats.degree.total}`)}`);
  col1.push(`  ${pc.bold('Depends On:')}  ${pc.white(stats.dependencies)} ${pc.dim('files')}`);
  col1.push(`  ${pc.bold('Depended By:')} ${pc.white(stats.dependents)} ${pc.dim('files')}`);

  const col2 = [];
  if (stats.entities) {
    col2.push(`  ${pc.bold('Entities:')}    ${pc.white(stats.entities.total)}  ${pc.dim(`(${stats.entities.classes} classes, ${stats.entities.functions} functions, ${stats.entities.methods} methods)`)}`);
  } else {
    col2.push('');
  }
  if (stats.cycles.length > 0) {
    col2.push(`  ${pc.bold('In Cycles:')}   ${pc.yellow(stats.cycles.length)}  ${pc.dim(stats.cycles.map(c => `#${c}`).join(', '))}`);
  } else {
    col2.push(`  ${pc.bold('Cycles:')}      ${pc.green('none detected')}`);
  }
  if (stats.isIsolated) {
    col2.push(`  ${pc.bold('Isolated:')}   ${pc.yellow('Yes')}  ${pc.dim('no dependencies or dependents')}`);
  }

  const col3 = [];

  return [col1, col2, col3];
}

function buildTargetEntityLines(stats) {
  const col1 = [];
  col1.push(pc.bold(`  ── ${stats.label} ──`));
  col1.push(`  ${pc.dim(toRelative(stats.id))}`);
  col1.push(`  ${pc.bold('Type:')}        ${pc.white('Entity')}  ${pc.dim(`(${stats.kind})`)}`);
  col1.push(`  ${pc.bold('Parent File:')} ${pc.cyan(stats.parentFile ? toRelative(stats.parentFile) : '—')}`);
  col1.push(`  ${pc.bold('Community:')}   ${pc.white(stats.community || '—')}  ${pc.dim('inherited')}`);
  col1.push(`  ${pc.bold('Degree:')}      ${pc.cyan(`in=${stats.degree.in}`)}  ${pc.red(`out=${stats.degree.out}`)}  ${pc.white(`total=${stats.degree.total}`)}`);

  const col2 = [];
  if (stats.cycles.length > 0) {
    col2.push(`  ${pc.bold('In Cycles:')}   ${pc.yellow(stats.cycles.length)}  ${pc.dim(stats.cycles.map(c => `#${c}`).join(', '))}`);
  }

  return [col1, col2, []];
}

function buildTargetExternalLines(stats) {
  const col1 = [];
  col1.push(pc.bold(`  ── ${stats.label} ──`));
  col1.push(`  ${pc.bold('Type:')}        ${pc.white('External')} ${pc.dim(stats.npm ? '(npm package)' : '(built-in)')}`);
  col1.push(`  ${pc.bold('Used By:')}    ${pc.white(stats.dependents)} ${pc.dim('files')}`);

  return [col1, [], []];
}

function renderTargetVertical(stats, options) {
  const { verbose } = options;
  const relPath = toRelative(stats.id);
  const label = stats.label;

  p.log.message('');
  p.log.message(pc.bold(`  ── ${label} ──`));
  if (relPath !== label) {
    p.log.message(`  ${pc.dim(relPath)}`);
  }
  p.log.message('');

  if (stats.type === 'file') {
    p.log.message(`  ${pc.bold('Language:')}    ${pc.white(stats.language || 'Unknown')}`);
    p.log.message(`  ${pc.bold('Community:')}   ${pc.white(stats.community || '—')}`);
    p.log.message(`  ${pc.bold('Degree:')}      ${pc.cyan(`in=${stats.degree.in}`)}  ${pc.red(`out=${stats.degree.out}`)}  ${pc.white(`total=${stats.degree.total}`)}`);
    p.log.message(`  ${pc.bold('Depends On:')}  ${pc.white(stats.dependencies)} ${pc.dim('files')}`);
    p.log.message(`  ${pc.bold('Depended By:')} ${pc.white(stats.dependents)} ${pc.dim('files')}`);

    if (stats.entities) {
      p.log.message(`  ${pc.bold('Entities:')}    ${pc.white(stats.entities.total)}  ${pc.dim(`(${stats.entities.classes} classes, ${stats.entities.functions} functions, ${stats.entities.methods} methods)`)}`);
    }

    if (stats.isIsolated) {
      p.log.message(`  ${pc.bold('Isolated:')}   ${pc.yellow('Yes')}  ${pc.dim('no dependencies or dependents')}`);
    }

  } else if (stats.type === 'entity') {
    p.log.message(`  ${pc.bold('Type:')}        ${pc.white('Entity')}  ${pc.dim(`(${stats.kind})`)}`);
    p.log.message(`  ${pc.bold('Parent File:')} ${pc.cyan(stats.parentFile ? toRelative(stats.parentFile) : '—')}`);
    p.log.message(`  ${pc.bold('Community:')}   ${pc.white(stats.community || '—')}  ${pc.dim('inherited')}`);
    p.log.message(`  ${pc.bold('Degree:')}      ${pc.cyan(`in=${stats.degree.in}`)}  ${pc.red(`out=${stats.degree.out}`)}  ${pc.white(`total=${stats.degree.total}`)}`);

  } else if (stats.type === 'external') {
    p.log.message(`  ${pc.bold('Type:')}        ${pc.white('External')} ${pc.dim(stats.npm ? '(npm package)' : '(built-in)')}`);
    p.log.message(`  ${pc.bold('Used By:')}    ${pc.white(stats.dependents)} ${pc.dim('files')}`);
  }

  if (stats.cycles.length > 0) {
    p.log.message(`  ${pc.bold('In Cycles:')}   ${pc.yellow(stats.cycles.length)}  ${pc.dim(stats.cycles.map(c => `#${c}`).join(', '))}`);
  }

  // Verbose entity list
  if (verbose && stats.type === 'file' && stats.entityList) {
    p.log.message('');
    for (const ent of stats.entityList) {
      const icon = ent.kind === 'class' ? pc.green('◈') :
        ent.kind === 'function' ? pc.magenta('◇') : pc.dim('•');
      p.log.message(`  ${icon} ${ent.name}  ${pc.dim(`(${ent.kind})`)}`);
    }
  }
}

function renderTargetColumns(stats) {
  let sections;
  if (stats.type === 'file') sections = buildTargetFileLines(stats);
  else if (stats.type === 'entity') sections = buildTargetEntityLines(stats);
  else sections = buildTargetExternalLines(stats);

  // Only use columns that have content
  const nonEmpty = sections.filter(s => s.length > 0);
  const colCount = Math.min(nonEmpty.length, 3);
  const weights = colCount === 2 ? [0.65, 0.35] : [0.50, 0.30, 0.20];
  const widths = getColWidths(getTerminalWidth() - 2, colCount, weights);
  const rows = renderColumns(nonEmpty, widths);
  for (const row of rows) {
    p.log.message(row);
  }
}

function renderTargetStats(stats, options) {
  if (useColumns()) {
    renderTargetColumns(stats);
  } else {
    renderTargetVertical(stats, options);
  }

  // Legend always at bottom
  p.log.message('');
  p.log.message(
    pc.dim('  Legend: ') +
    pc.cyan('● file') + pc.dim(' · ') +
    pc.yellow('◆ package') + pc.dim(' · ') +
    pc.magenta('◇ entity')
  );

  // Verbose entity list for file in column mode
  if (options.verbose && stats.type === 'file' && stats.entityList) {
    p.log.message('');
    for (const ent of stats.entityList) {
      const icon = ent.kind === 'class' ? pc.green('◈') :
        ent.kind === 'function' ? pc.magenta('◇') : pc.dim('•');
      p.log.message(`  ${icon} ${ent.name}  ${pc.dim(`(${ent.kind})`)}`);
    }
  }
}

function formatRelPath(nodeId) {
  return pc.dim(toRelative(nodeId));
}

/* ── Main command ── */

export async function statCommand(target, options = {}) {
  const { json = false, top = '5', all = false, verbose = false, out = null } = options;
  const topN = all ? Infinity : (Number(top) || 5);
  const isJson = json;

  if (!isJson) {
    p.intro(pc.bgCyan(pc.black(' codebase-vis stat ')));
  }

  const s = isJson ? null : p.spinner();

  if (s) s.start('Loading graph');
  const graph = await loadGraph();
  if (!graph) {
    if (s) s.stop(pc.red('Failed'));
    if (!isJson) {
      p.log.error(pc.red('graph.json not found. Run ') + pc.cyan('codebase-vis generate') + pc.red(' first.'));
      p.outro(pc.dim('Nothing to analyze.'));
    }
    return;
  }
  if (s) s.stop(pc.green(`Graph loaded: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  let nodeId = null;
  if (target) {
    nodeId = await resolveNode(graph, target);
    if (nodeId === undefined) {
      if (!isJson) p.outro(pc.dim('Stat cancelled.'));
      return;
    }
    if (nodeId === null) {
      if (!isJson) {
        p.log.error(pc.red(`No node found matching "${pc.bold(target)}".`));
        p.outro(pc.dim('Stat cancelled.'));
      }
      return;
    }
  }

  if (s) s.start('Computing stats');
  const cycles = await loadCycles();

  let stats;
  if (nodeId) {
    stats = computeTargetStats(graph, nodeId, { verbose, cycles });
  } else {
    stats = computeGlobalStats(graph, { verbose, topN, cycles });
  }
  if (s) s.stop(pc.green('Stats computed'));

  if (isJson) {
    const output = JSON.stringify(stats, null, 2);
    if (out) {
      const outPath = path.resolve(process.cwd(), out);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, output, 'utf-8');
    } else {
      console.log(output);
    }
    return;
  }

  if (out) {
    p.log.warn(pc.yellow('--out flag ignored without --json'));
  }

  resetTimer();

  if (nodeId) {
    renderTargetStats(stats, { verbose });
  } else {
    renderGlobalStats(stats, { verbose, topN });
  }

  p.outro(pc.green('✔') + pc.dim(' Stat complete.'));
}