import Graph from 'graphology';
import path from 'node:path';
import fs from 'node:fs';
import { enrichNodes } from './enricher.js';

export function buildGraph(parsedData) {
  const pkgDeps = loadPackageDeps();
  // Initialize a directed graph 
  const graph = new Graph({ multi: true, directed: true });

  // Checks if a path is relative by matching:
  // ^      - start of string
  // \.     - a literal dot
  // \.?    - an optional second dot (for ..)
  // [/\\]  - a forward or backward slash
  const isRelative = (s) => /^\.\.?[/\\]/.test(s);

  for (const data of parsedData) {
    graph.addNode(data.id, {
      dependencies: data.dependencies,
    });

    const entities = data.entities;

    // Handle structured entities: { classes, functions, docstrings }
    if (entities && !Array.isArray(entities)) {
      for (const cls of [...new Set(entities.classes || [])]) {
        const entityId = `${data.id}::${cls}`;
        if (!graph.hasNode(entityId)) {
          graph.addNode(entityId, { label: cls, kind: 'class' });
          graph.addEdge(data.id, entityId, { relation: 'contains' });
        }
      }

      for (const fn of [...new Set(entities.functions || [])]) {
        const entityId = `${data.id}::${fn}`;
        if (!graph.hasNode(entityId)) {
          graph.addNode(entityId, { label: fn, kind: 'function' });
          graph.addEdge(data.id, entityId, { relation: 'contains' });
        }
      }

      for (const method of [...new Set(entities.methods || [])]) {
        const entityId = `${data.id}::${method}`;
        if (!graph.hasNode(entityId)) {
          graph.addNode(entityId, { label: method, kind: 'method' });
          graph.addEdge(data.id, entityId, { relation: 'contains' });
        }
      }

      if (entities.docstrings && entities.docstrings.length > 0) {
        graph.setNodeAttribute(data.id, 'docstrings', entities.docstrings);
      }
    } else {
      // Backward compatibility: flat array of entity names
      for (const entity of [...new Set(entities || [])]) {
        const entityId = `${data.id}::${entity}`;
        graph.addNode(entityId, { label: entity, kind: 'entity' });
        graph.addEdge(data.id, entityId, { relation: 'contains' });
      }
    }
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
        graph.mergeNode(dep, { external: true, label: dep, npm: pkgDeps.has(dep) });
        graph.addEdge(data.id, dep, { relationship: 'imports' });
      }
    }
  }

  // Apply structural styling 
  enrichNodes(graph);

  return graph;
}

function loadPackageDeps() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    return new Set(Object.keys(all));
  } catch {
    return new Set();
  }
}