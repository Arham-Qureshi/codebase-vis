import path from 'node:path'; // For working with file paths.
import { safeWriteFile } from '../utils/file-system.js';

//exports the graph to json files
export async function exportGraphToJson(graph, outDir) {
  const graphData = graph.export();
  const usePretty = graphData.nodes.length < 50000;
  const data = JSON.stringify(graphData, null, usePretty ? 2 : 0);
  const targetPath = path.join(outDir, 'graph.json');
  await safeWriteFile(targetPath, data);
  return targetPath;
}
