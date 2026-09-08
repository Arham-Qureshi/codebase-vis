import path from 'node:path';

const ENTITY_KINDS = new Set(['entity', 'class', 'function', 'method']);
const MAX_CYCLES = 200;

function isFileNode(attrs) {
  return !attrs.external && !ENTITY_KINDS.has(attrs.kind);
}

function canonicalKey(cyclePath) {
  let minIdx = 0;
  for (let i = 1; i < cyclePath.length; i++) {
    if (cyclePath[i] < cyclePath[minIdx]) minIdx = i;
  }
  const rotated = [...cyclePath.slice(minIdx), ...cyclePath.slice(0, minIdx)];
  return rotated.join('|');
}

export function detectCycles(graph) {
  const fileNodes = [];
  graph.forEachNode((node, attrs) => {
    if (isFileNode(attrs)) fileNodes.push(node);
  });

  const fileSet = new Set(fileNodes);
  const cycles = new Map();
  const globalVisited = new Set();

  function dfs(start) {
    const stack = [{ node: start, neighbors: null }];
    const onStack = new Set([start]);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.neighbors === null) {
        // First visit: collect neighbors
        globalVisited.add(frame.node);
        const neighbors = [];
        graph.forEachOutNeighbor(frame.node, (neighbor) => {
          if (fileSet.has(neighbor)) neighbors.push(neighbor);
        });
        frame.neighbors = neighbors;
        frame.idx = 0;
      }

      if (frame.idx >= frame.neighbors.length) {
        // Done with this node
        stack.pop();
        onStack.delete(frame.node);
        continue;
      }

      const neighbor = frame.neighbors[frame.idx++];

      if (onStack.has(neighbor)) {
        // Found a cycle
        if (cycles.size >= MAX_CYCLES) return;
        const cyclePath = [];
        for (const f of stack) cyclePath.push(f.node);
        const idx = cyclePath.indexOf(neighbor);
        const cycle = cyclePath.slice(idx);
        const key = canonicalKey(cycle);
        if (!cycles.has(key)) {
          cycles.set(key, [...cycle, neighbor]);
        }
      } else if (!globalVisited.has(neighbor)) {
        stack.push({ node: neighbor, neighbors: null });
        onStack.add(neighbor);
      }
    }
  }

  for (const node of fileNodes) {
    if (cycles.size >= MAX_CYCLES) break;
    dfs(node);
  }

  return Array.from(cycles.values());
}

export function enrichCycles(graph, cycles) {
  return cycles.map((cycle, idx) => {
    const files = cycle.map(nodeId => {
      const attrs = graph.getNodeAttributes(nodeId);
      return {
        id: nodeId,
        label: attrs.label || path.basename(nodeId),
      };
    });

    const edges = [];
    for (let i = 0; i < cycle.length - 1; i++) {
      edges.push({ from: cycle[i], to: cycle[i + 1] });
    }

    return {
      id: idx + 1,
      size: cycle.length - 1,
      files,
      edges,
      label: files.map(f => f.label).join(' → '),
    };
  });
}