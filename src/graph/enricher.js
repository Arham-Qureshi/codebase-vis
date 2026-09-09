import path from 'node:path';
import { EXT_TO_LANGUAGE } from '../parser/languages.js';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

const PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
  '#AF7AA1', '#86BCB6',
];

const EXTERNAL_COLOR = '#2d6a4f';
const ENTITY_COLOR = '#6a2d6a';
const ENTITY_KINDS = new Set([
  'entity', 'class', 'function', 'method', 'heading',
  'dependency', 'pkg-category', 'pkg-metadata', 'keyword', 'script',
]);

const DEP_TYPE_COLORS = {
  dependencies: '#4E79A7',
  devDependencies: '#F28E2B',
  peerDependencies: '#76B7B2',
  optionalDependencies: '#B07AA1',
  require: '#4E79A7',
  'require-dev': '#F28E2B',
  build_dependencies: '#B07AA1',
  dev_dependencies: '#F28E2B',
};

const HEADING_COLORS = {
  1: '#E15759',
  2: '#59A14F',
  3: '#EDC948',
  4: '#B07AA1',
  5: '#FF9DA7',
  6: '#9C755F'
};

const PKG_CATEGORY_COLOR = '#0ea5e9';
const PKG_METADATA_COLOR = '#8b5cf6';
const KEYWORD_COLOR = '#f59e0b';
const SCRIPT_COLOR = '#10b981';

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
  return first.slice(0, depth).join(path.sep) || '.';
}

export { findCommonRoot };

function nameCommunities(communityFileMap, commonRoot) {
  const rawNames = new Map();
  for (const [communityId, fileNodes] of communityFileMap) {
    const dirCounts = new Map();
    for (const node of fileNodes) {
      const relDir = path.relative(commonRoot, path.dirname(node)) || '.';
      dirCounts.set(relDir, (dirCounts.get(relDir) || 0) + 1);
    }
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
  const fileNodes = [];
  graph.forEachNode((node, attrs) => {
    if (!attrs.external && !ENTITY_KINDS.has(attrs.kind)) {
      fileNodes.push(node);
    }
  });

  const commonRoot = findCommonRoot(fileNodes.map((n) => path.dirname(n)));

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

  const communities = louvain(subgraph);

  const communityFileMap = new Map();
  for (const [node, communityId] of Object.entries(communities)) {
    if (!communityFileMap.has(communityId)) {
      communityFileMap.set(communityId, []);
    }
    communityFileMap.get(communityId).push(node);
  }

  const communityNames = nameCommunities(communityFileMap, commonRoot);

  const communityColorMap = new Map();
  let colorIdx = 0;
  for (const communityId of communityFileMap.keys()) {
    communityColorMap.set(communityId, PALETTE[colorIdx % PALETTE.length]);
    colorIdx++;
  }

  const nodeInfoMap = new Map();
  for (const [communityId, nodes] of communityFileMap) {
    const name = communityNames.get(communityId);
    const color = communityColorMap.get(communityId);
    for (const node of nodes) {
      nodeInfoMap.set(node, { community: name, color });
    }
  }

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  let spiralIdx = 0;
  graph.forEachNode((node, attributes) => {
    const r = Math.sqrt(spiralIdx) * 12;
    const theta = spiralIdx * GOLDEN_ANGLE;
    const baseAttrs = {
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      size: Math.max(5, Math.min(15, graph.degree(node))),
      label: attributes.label || path.basename(node),
    };
    spiralIdx++;
    setAttrs(graph, node, baseAttrs);

    if (attributes.external) {
      setAttrs(graph, node, { community: 'dependencies', color: EXTERNAL_COLOR });
      return;
    }

    if (ENTITY_KINDS.has(attributes.kind)) {
      if (attributes.kind === 'dependency') {
        setAttrs(graph, node, {
          size: 4,
          color: DEP_TYPE_COLORS[attributes.depType] || '#9C755F',
          community: 'dependencies'
        });
        return;
      }
      if (attributes.kind === 'pkg-category') {
        setAttrs(graph, node, {
          size: 5,
          color: PKG_CATEGORY_COLOR,
          community: 'package-config'
        });
        return;
      }
      if (attributes.kind === 'pkg-metadata') {
        setAttrs(graph, node, {
          size: 4,
          color: PKG_METADATA_COLOR,
          community: 'package-config'
        });
        return;
      }
      if (attributes.kind === 'keyword') {
        setAttrs(graph, node, {
          size: 3,
          color: KEYWORD_COLOR,
          community: 'package-config'
        });
        return;
      }
      if (attributes.kind === 'script') {
        setAttrs(graph, node, {
          size: 3,
          color: SCRIPT_COLOR,
          community: 'package-config'
        });
        return;
      }
      if (attributes.kind === 'heading') {
        setAttrs(graph, node, {
          size: Math.max(3, 8 - (attributes.headingLevel || 1)),
          color: HEADING_COLORS[attributes.headingLevel] || '#94a3b8',
          community: 'documentation'
        });
        return;
      }
      const sepIdx = node.lastIndexOf('::');
      const parentFile = sepIdx !== -1 ? node.slice(0, sepIdx) : node;
      const parentInfo = nodeInfoMap.get(parentFile);
      setAttrs(graph, node, {
        size: 3,
        community: parentInfo ? parentInfo.community : 'other',
        color: ENTITY_COLOR,
      });
      return;
    }

    const info = nodeInfoMap.get(node);
    const ext = path.extname(node).toLowerCase();
    if (info) {
      setAttrs(graph, node, {
        community: info.community,
        color: info.color,
        language: EXT_TO_LANGUAGE[ext] || 'Unknown',
      });
    } else {
      const relDir = path.relative(commonRoot, path.dirname(node)) || '.';
      setAttrs(graph, node, {
        community: relDir,
        color: '#94a3b8',
        language: EXT_TO_LANGUAGE[ext] || 'Unknown',
      });
    }
  });
}
