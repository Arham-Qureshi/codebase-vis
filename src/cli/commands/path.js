import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadGraph, resolveNode, formatNodeLabel, toRelative } from '../shared.js';

// Bidirectional BFS — searches from source (forward) and target (backward)
// simultaneously, meeting in the middle for exponential speedup
function bidirectionalBFS(graph, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];

  // Forward frontier (source → outNeighbors)
  const fwdParent = new Map([[sourceId, null]]);
  let fwdFrontier = [sourceId];

  // Backward frontier (target ← inNeighbors)
  const bwdParent = new Map([[targetId, null]]);
  let bwdFrontier = [targetId];

  while (fwdFrontier.length > 0 && bwdFrontier.length > 0) {
    // Expand the smaller frontier for efficiency
    if (fwdFrontier.length <= bwdFrontier.length) {
      const nextFwd = [];
      for (const node of fwdFrontier) {
        for (const neighbor of graph.outNeighbors(node)) {
          if (fwdParent.has(neighbor)) continue;
          fwdParent.set(neighbor, node);
          nextFwd.push(neighbor);

          // Check if backward search already visited this node
          if (bwdParent.has(neighbor)) {
            return buildPath(fwdParent, bwdParent, neighbor);
          }
        }
      }
      fwdFrontier = nextFwd;
    } else {
      const nextBwd = [];
      for (const node of bwdFrontier) {
        for (const neighbor of graph.inNeighbors(node)) {
          if (bwdParent.has(neighbor)) continue;
          bwdParent.set(neighbor, node);
          nextBwd.push(neighbor);

          // Check if forward search already visited this node
          if (fwdParent.has(neighbor)) {
            return buildPath(fwdParent, bwdParent, neighbor);
          }
        }
      }
      bwdFrontier = nextBwd;
    }
  }

  return null; // no path
}

// Reconstruct the full path from forward + backward parent maps
function buildPath(fwdParent, bwdParent, meetingNode) {
  // Build source → meeting
  const firstHalf = [];
  let cur = meetingNode;
  while (cur !== null) {
    firstHalf.unshift(cur);
    cur = fwdParent.get(cur);
  }

  // Build meeting → target
  cur = bwdParent.get(meetingNode);
  while (cur !== null) {
    firstHalf.push(cur);
    cur = bwdParent.get(cur);
  }

  return firstHalf;
}

// path => trace the shortest dependency path between two nodes
export async function pathCommand(source, target) {
  p.intro(pc.bgCyan(pc.black(' codebase-vis path ')));

  const s = p.spinner();
  s.start('Loading graph');
  const graph = await loadGraph();
  if (!graph) {
    s.stop(pc.red('Failed'));
    p.log.error(pc.red('graph.json not found. Run ') + pc.cyan('codebase-vis generate') + pc.red(' first.'));
    p.outro(pc.dim('Nothing to trace.'));
    return;
  }
  s.stop(pc.green(`Graph loaded: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  // Resolve source node
  p.log.step(pc.dim('Resolving source...'));
  const sourceId = await resolveNode(graph, source);
  if (sourceId === undefined) { p.outro(pc.dim('Cancelled.')); return; }
  if (sourceId === null) {
    p.log.error(pc.red(`Source node not found: "${pc.bold(source)}"`));
    p.outro(pc.dim('Try a different search term.'));
    return;
  }

  // Resolve target node
  p.log.step(pc.dim('Resolving target...'));
  const targetId = await resolveNode(graph, target);
  if (targetId === undefined) { p.outro(pc.dim('Cancelled.')); return; }
  if (targetId === null) {
    p.log.error(pc.red(`Target node not found: "${pc.bold(target)}"`));
    p.outro(pc.dim('Try a different search term.'));
    return;
  }

  // Run Bidirectional BFS
  s.start('Computing shortest path (Bidirectional BFS)');
  const route = bidirectionalBFS(graph, sourceId, targetId);
  s.stop(pc.green(route ? `Path found: ${pc.bold(route.length)} nodes` : 'Search complete'));

  if (!route) {
    p.log.warn(
      pc.yellow('No path exists between ') +
      pc.cyan(toRelative(sourceId)) +
      pc.yellow(' and ') +
      pc.cyan(toRelative(targetId)) +
      pc.yellow('.')
    );
    p.outro(pc.dim('These nodes are not connected.'));
    return;
  }

  // Print the chain
  const sectionSep = pc.dim('─'.repeat(44));
  p.log.message('');
  p.log.message(sectionSep);
  p.log.message(pc.bold(pc.white(`  Dependency Path (${route.length} hops)`)));
  p.log.message(sectionSep);
  p.log.message('');

  route.forEach((nodeId, i) => {
    const attrs = graph.getNodeAttributes(nodeId);
    const icon = attrs.external ? pc.yellow('◆') :
      attrs.kind === 'entity' ? pc.magenta('◇') :
        pc.cyan('●');
    const label = formatNodeLabel(nodeId, attrs);

    p.log.message(`  ${icon} ${label}`);

    if (i < route.length - 1) {
      p.log.message(pc.dim('  │'));
      p.log.message(pc.dim('  ▼'));
    }
  });

  p.log.message('');
  p.log.message(
    pc.dim('  Legend: ') +
    pc.cyan('● file') + pc.dim(' · ') +
    pc.yellow('◆ package') + pc.dim(' · ') +
    pc.magenta('◇ entity')
  );

  p.outro(pc.green('✔') + pc.dim(' Path trace complete.'));
}
