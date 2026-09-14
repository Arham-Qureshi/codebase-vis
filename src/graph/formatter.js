import path from 'node:path';
import { safeWriteFile } from '../utils/file-system.js';

const STRIP_NODE_KEYS = new Set(['x', 'y', 'size', 'dependencies', 'depth', 'parent', 'scriptName']);
const STRIP_EDGE_KEYS = new Set(['depth', 'linkText']);

function stripAttrs(attrs, stripSet) {
  const clean = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!stripSet.has(k)) clean[k] = v;
  }
  return clean;
}

export async function exportGraphToJson(graph, outDir) {
  const targetPath = path.join(outDir, 'graph.json');
  const usePretty = graph.order < 50000;
  const nl = usePretty ? '\n' : '';
  const sp = usePretty ? '  ' : '';

  const options = { type: graph.type, multi: graph.multi };
  const chunks = [];
  chunks.push('{"options":' + JSON.stringify(options) + ',' + nl);
  chunks.push('"nodes":[' + nl);

  let nodeIdx = 0;
  graph.forEachNode((key, attributes) => {
    const clean = stripAttrs(attributes || {}, STRIP_NODE_KEYS);
    const prefix = nodeIdx > 0 ? ',' + nl : '';
    chunks.push(prefix + sp + JSON.stringify({ key, attributes: clean }));
    nodeIdx++;
  });

  chunks.push(nl + '],' + nl + '"edges":[' + nl);

  let edgeIdx = 0;
  graph.forEachEdge((edge, attributes, source, target) => {
    const clean = stripAttrs(attributes || {}, STRIP_EDGE_KEYS);
    const prefix = edgeIdx > 0 ? ',' + nl : '';
    chunks.push(prefix + sp + JSON.stringify({ source, target, attributes: clean }));
    edgeIdx++;
  });

  chunks.push(nl + ']}');

  await safeWriteFile(targetPath, chunks.join(''));
  return targetPath;
}
