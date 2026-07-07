import Graph from 'graphology';
import path from 'node:path';
import { enrichNodes } from './enricher.js';

export function buildGraph(parsedData) {
  // Initialize a directed graph 
  const graph = new Graph({ multi: true, directed: true });

  const isRelative = (s) => s.startsWith('./') || s.startsWith('../');

  for (const data of parsedData) {
    graph.addNode(data.id, {
      entities: data.entities,
      dependencies: data.dependencies,
    });
  }

  // Resolve dependencies
  for (const data of parsedData) {
    for (const dep of data.dependencies) {
      let target = null;

      if (isRelative(dep)) {
        // Standard relative path (./foo, ../bar)
        target = path.resolve(path.dirname(data.id), dep);
      } else {
        // in this case, either it will be a absolute path or a external file path
        const localCandidate = path.resolve(path.dirname(data.id), dep);
        if (graph.hasNode(localCandidate)) {
          target = localCandidate;
        }
      }

      if (target && graph.hasNode(target)) {
        graph.addEdge(data.id, target, { relationship: 'imports' });
      } else if (!isRelative(dep)) {
        // External package or Node built-in
        graph.mergeNode(dep, { external: true, label: dep });
        graph.addEdge(data.id, dep, { relationship: 'imports' });
      }
    }
  }

  // Apply structural styling 
  enrichNodes(graph);

  return graph;
}