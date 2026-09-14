import path from 'node:path';
import { safeWriteFile } from '../utils/file-system.js';

const STRIP_NODE_KEYS = new Set(['x', 'y', 'size', 'dependencies', 'depth', 'parent', 'scriptName']);
const STRIP_EDGE_KEYS = new Set(['depth', 'linkText']);

function stripDeadAttributes(graphData) {
  for (const node of graphData.nodes) {
    if (!node.attributes) continue;
    for (const key of STRIP_NODE_KEYS) {
      if (key in node.attributes) delete node.attributes[key];
    }
  }
  for (const edge of graphData.edges) {
    if (!edge.attributes) continue;
    for (const key of STRIP_EDGE_KEYS) {
      if (key in edge.attributes) delete edge.attributes[key];
    }
  }
  return graphData;
}

export async function exportGraphToJson(graph, outDir) {
  const graphData = stripDeadAttributes(graph.export());
  const usePretty = graphData.nodes.length < 50000;
  const data = JSON.stringify(graphData, null, usePretty ? 2 : 0);
  const targetPath = path.join(outDir, 'graph.json');
  await safeWriteFile(targetPath, data);
  return targetPath;
}
