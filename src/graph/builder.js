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
      const resolved = isRelative(dep)
        ? path.resolve(path.dirname(data.id), dep)
        : dep;

      if (graph.hasNode(resolved)) {
        // The dependency resolves to a local file that we parsed
        graph.addEdge(data.id, resolved, { relationship: 'imports' });
      } else if (!isRelative(dep)) {
        // The dependency is an external NPM package or Node built-in
        graph.mergeNode(dep, { external: true, label: dep });
        graph.addEdge(data.id, dep, { relationship: 'imports' });
      }
    }
  }

  // Apply structural styling 
  enrichNodes(graph);

  return graph;
}