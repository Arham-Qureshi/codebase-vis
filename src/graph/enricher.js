import path from 'node:path';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

const PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
  '#AF7AA1', '#86BCB6',
];

const EXTERNAL_COLOR = '#64748B';
const ENTITY_KINDS = new Set(['entity', 'class', 'function', 'method']);

const LANGUAGE_MAP = {
  '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.py': 'Python',
  '.cpp': 'C++', '.h': 'C++', '.hpp': 'C++',
  '.html': 'HTML',
  '.css': 'CSS',
};

function setAttrs(graph, node, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    graph.setNodeAttribute(node, key, value);
  }
}

function findCommonRoot(absPaths) {
  if (absPaths.length === 0) return '';
  const split = absPaths.map((p) => p.split(path.sep));
  const first = split[0];
  let depth = 0;
  while (depth < first.length && split.every((s) => s[depth] === first[depth])) {
    depth++;
  }
  return first.slice(0, depth).join(path.sep) || path.sep;
}

export { findCommonRoot };

/**
 * Derives a human-readable name for each Louvain community by finding
 * the most common directory among its file nodes.
 * When two communities share the same dominant directory, they get
 * disambiguated with #1, #2 suffixes.
 */
function nameCommunities(communityFileMap, commonRoot) {
  // Step 1: For each community, find the most frequent directory
  const rawNames = new Map(); // communityId → best directory label
  for (const [communityId, fileNodes] of communityFileMap) {
    const dirCounts = new Map();
    for (const node of fileNodes) {
      const relDir = path.relative(commonRoot, path.dirname(node)) || '.';
      dirCounts.set(relDir, (dirCounts.get(relDir) || 0) + 1);
    }
    // Pick the directory with the most files
    let bestDir = '.';
    let bestCount = 0;
    for (const [dir, count] of dirCounts) {
      if (count > bestCount) {
        bestDir = dir;
        bestCount = count;
      }
    }
    rawNames.set(communityId, bestDir);
  }

  // Step 2: Disambiguate duplicate names with #1, #2 suffixes
  const nameCounts = new Map();
  for (const name of rawNames.values()) {
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  const nameCounters = new Map();
  const finalNames = new Map();
  for (const [communityId, name] of rawNames) {
    if (nameCounts.get(name) > 1) {
      const idx = (nameCounters.get(name) || 0) + 1;
      nameCounters.set(name, idx);
      finalNames.set(communityId, `${name} #${idx}`);
    } else {
      finalNames.set(communityId, name);
    }
  }

  return finalNames;
}

export function enrichNodes(graph) {
  // ── 1. Collect file nodes (non-external, non-entity) ──
  const fileNodes = [];
  graph.forEachNode((node, attrs) => {
    if (!attrs.external && !ENTITY_KINDS.has(attrs.kind)) {
      fileNodes.push(node);
    }
  });

  const commonRoot = findCommonRoot(fileNodes.map((n) => path.dirname(n)));

  // ── 2. Run Louvain on a file-only subgraph for clean communities ──
  //    Louvain needs an undirected graph, so we build one from file→file edges.
  const fileSet = new Set(fileNodes);
  const subgraph = new Graph({ type: 'undirected' });
  for (const node of fileNodes) subgraph.addNode(node);

  graph.forEachEdge((edge, attrs, source, target) => {
    if (fileSet.has(source) && fileSet.has(target) && source !== target) {
      if (!subgraph.hasEdge(source, target)) {
        subgraph.addEdge(source, target);
      }
    }
  });

  // Run Louvain community detection
  const communities = louvain(subgraph); // { nodeId: communityInt }

  // ── 3. Group file nodes by their Louvain community ──
  const communityFileMap = new Map(); // communityId → [nodeId]
  for (const [node, communityId] of Object.entries(communities)) {
    if (!communityFileMap.has(communityId)) {
      communityFileMap.set(communityId, []);
    }
    communityFileMap.get(communityId).push(node);
  }

  // ── 4. Name communities using smart directory naming ──
  const communityNames = nameCommunities(communityFileMap, commonRoot);

  // ── 5. Assign colors per community ──
  const communityColorMap = new Map();
  let colorIdx = 0;
  for (const communityId of communityFileMap.keys()) {
    communityColorMap.set(communityId, PALETTE[colorIdx % PALETTE.length]);
    colorIdx++;
  }

  // ── 6. Build a lookup: nodeId → { community name, color } for file nodes ──
  const nodeInfoMap = new Map();
  for (const [communityId, nodes] of communityFileMap) {
    const name = communityNames.get(communityId);
    const color = communityColorMap.get(communityId);
    for (const node of nodes) {
      nodeInfoMap.set(node, { community: name, color });
    }
  }

  // ── 7. Apply attributes to every node ──
  graph.forEachNode((node, attributes) => {
    const baseAttrs = {
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.max(5, Math.min(15, graph.degree(node))),
      label: attributes.label || path.basename(node),
    };
    setAttrs(graph, node, baseAttrs);

    // External packages
    if (attributes.external) {
      setAttrs(graph, node, { community: 'dependencies', color: EXTERNAL_COLOR });
      return;
    }

    // Entities, classes, functions, methods — inherit community + color from parent file
    if (ENTITY_KINDS.has(attributes.kind)) {
      const sepIdx = node.lastIndexOf('::');
      const parentFile = sepIdx !== -1 ? node.slice(0, sepIdx) : node;
      const parentInfo = nodeInfoMap.get(parentFile);
      setAttrs(graph, node, {
        size: 3,
        community: parentInfo ? parentInfo.community : 'other',
        color: parentInfo ? parentInfo.color : '#94a3b8',
      });
      return;
    }

    // File nodes — use Louvain community
    const info = nodeInfoMap.get(node);
    const ext = path.extname(node).toLowerCase();
    if (info) {
      setAttrs(graph, node, {
        community: info.community,
        color: info.color,
        language: LANGUAGE_MAP[ext] || 'Unknown',
      });
    } else {
      // Fallback for isolated nodes
      const relDir = path.relative(commonRoot, path.dirname(node)) || '.';
      setAttrs(graph, node, {
        community: relDir,
        color: '#94a3b8',
        language: LANGUAGE_MAP[ext] || 'Unknown',
      });
    }
  });
}