import path from 'node:path'; // For working with file paths.
import { safeWriteFile } from '../utils/file-system.js';

//exports the graph to json files
export async function exportGraphToJson(graph, outDir) {
  const data = JSON.stringify(graph.export(), null, 2);
  const targetPath = path.join(outDir, 'graph.json');
  await safeWriteFile(targetPath, data);
  return targetPath;
}
