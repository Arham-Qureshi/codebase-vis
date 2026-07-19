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
  const visited = new Set();
  const pathStack = [];
  const stackSet = new Set();
  const cycles = new Map();

  function dfs(node) {
    visited.add(node);
    pathStack.push(node);
    stackSet.add(node);

    graph.forEachOutNeighbor(node, (neighbor) => {
      if (!fileSet.has(neighbor)) return;
      if (cycles.size >= MAX_CYCLES) return;

      if (stackSet.has(neighbor)) {
        const idx = pathStack.indexOf(neighbor);
        const cyclePath = pathStack.slice(idx);
        const key = canonicalKey(cyclePath);
        if (!cycles.has(key)) {
          cycles.set(key, [...cyclePath, neighbor]);
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    });

    pathStack.pop();
    stackSet.delete(node);
  }

  for (const node of fileNodes) {
    if (!visited.has(node)) {
      dfs(node);
      if (cycles.size >= MAX_CYCLES) break;
    }
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