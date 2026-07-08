import path from 'node:path';

const PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
  '#AF7AA1', '#86BCB6',
];

const EXTERNAL_COLOR = '#64748B';

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

export function enrichNodes(graph) {
  const localNodes = [];

  graph.forEachNode((node, attrs) => {
    if (!attrs.external) localNodes.push(node);
  });

  // Compute common root so we can build short, readable directory labels
  const absDirs = localNodes.map((n) => path.dirname(n));
  const commonRoot = findCommonRoot(absDirs);

  // Map each unique absolute directory to a color + human label
  const dirColorMap = new Map();
  let colorIdx = 0;

  for (const node of localNodes) {
    const absDir = path.dirname(node);
    if (!dirColorMap.has(absDir)) {
      const relDir = path.relative(commonRoot, absDir) || '.';
      dirColorMap.set(absDir, {
        color: PALETTE[colorIdx % PALETTE.length],
        label: relDir,
      });
      colorIdx++;
    }
  }
  graph.forEachNode((node, attributes) => {
    const baseAttrs = {
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.max(5, Math.min(15, graph.degree(node))),
      label: attributes.label || path.basename(node),
    };
    setAttrs(graph, node, baseAttrs);

    if (attributes.external) {
      setAttrs(graph, node, { community: 'dependencies', color: EXTERNAL_COLOR });
      return;
    }

    if (attributes.kind === 'entity' || attributes.kind === 'class' || attributes.kind === 'function') {
      const absDir = path.dirname(node);
      const info = dirColorMap.get(absDir);
      setAttrs(graph, node, {
        size: 3,
        community: 'entities',
        color: info ? info.color : '#94a3b8',
      });
      return;
    }

    const absDir = path.dirname(node);
    const ext = path.extname(node).toLowerCase();
    const info = dirColorMap.get(absDir);
    setAttrs(graph, node, {
      community: info.label,
      color: info.color,
      language: LANGUAGE_MAP[ext] || 'Unknown',
    });
  });
}