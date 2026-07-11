import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import { loadGraph, resolveNode, formatNodeLabel, toRelative } from '../shared.js';

// query => look up a node's dependencies and dependents
export async function queryCommand(target) {
  p.intro(pc.bgCyan(pc.black(' codebase-vis query ')));

  const s = p.spinner();
  s.start('Loading graph');
  const graph = await loadGraph();
  if (!graph) {
    s.stop(pc.red('Failed'));
    p.log.error(pc.red('graph.json not found. Run ') + pc.cyan('codebase-vis generate') + pc.red(' first.'));
    p.outro(pc.dim('Nothing to query.'));
    return;
  }
  s.stop(pc.green(`Graph loaded: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  // Resolve node
  const nodeId = await resolveNode(graph, target);
  if (nodeId === undefined) { p.outro(pc.dim('Query cancelled.')); return; }
  if (nodeId === null) {
    p.log.error(pc.red(`No node found matching "${pc.bold(target)}".`));
    p.outro(pc.dim('Try a different search term.'));
    return;
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