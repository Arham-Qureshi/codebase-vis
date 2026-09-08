import Graph from 'graphology';
import path from 'node:path';
import fs from 'node:fs';
import { enrichNodes } from './enricher.js';
import { resolveJsImport } from '../parser/resolver.js';

const MAX_NODES = 500000;

function sanitizeName(name) {
  return String(name).replace(/::/g, '__').replace(/[&<>"']/g, '_').trim();
}

function estimateEntityCount(parsedData) {
  let count = 0;
  for (const data of parsedData) {
    const entities = data.entities;
    if (entities && !Array.isArray(entities)) {
      count += (entities.classes?.length || 0) + (entities.functions?.length || 0) + (entities.methods?.length || 0);
    } else if (entities) {
      count += entities.length;
    }
  }
  return count;
}

export function buildGraph(parsedData) {
  const pkgDeps = loadPackageDeps();
  const graph = new Graph({ multi: true, directed: true });

  const isRelative = (s) => /^\.\.?[/\\]/.test(s);

  const entityCount = estimateEntityCount(parsedData);
  const skipEntities = (parsedData.length + entityCount) > MAX_NODES;
  if (skipEntities) {
    console.warn(`[WARN] Graph would exceed ${MAX_NODES} nodes (${parsedData.length} files + ${entityCount} entities). Skipping entity nodes to conserve memory.`);
  }

  for (const data of parsedData) {
    graph.addNode(data.id, {
      dependencies: data.dependencies,
    });

    if (skipEntities) continue;

    const entities = data.entities;

    if (entities && !Array.isArray(entities)) {
      for (const cls of [...new Set(entities.classes || [])]) {
        const safe = sanitizeName(cls);
        const entityId = `${data.id}::${safe}`;
        if (!graph.hasNode(entityId)) {
          graph.addNode(entityId, { label: safe, kind: 'class' });
          graph.addEdge(data.id, entityId, { relation: 'contains' });
        }
      }

      for (const fn of [...new Set(entities.functions || [])]) {
        const safe = sanitizeName(fn);
        const entityId = `${data.id}::${safe}`;
        if (!graph.hasNode(entityId)) {
          graph.addNode(entityId, { label: safe, kind: 'function' });
          graph.addEdge(data.id, entityId, { relation: 'contains' });
        }
      }

      for (const method of [...new Set(entities.methods || [])]) {
        const safe = sanitizeName(method);
        const entityId = `${data.id}::${safe}`;
        if (!graph.hasNode(entityId)) {
          graph.addNode(entityId, { label: safe, kind: 'method' });
          graph.addEdge(data.id, entityId, { relation: 'contains' });
        }
      }

      if (entities.docstrings && entities.docstrings.length > 0) {
        graph.setNodeAttribute(data.id, 'docstrings', entities.docstrings);
      }
      if (entities.inherits && entities.inherits.length > 0) {
        for (const base of [...new Set(entities.inherits)]) {
          const safe = sanitizeName(base);
          graph.mergeNode(safe, { external: true, label: safe });
          graph.addEdge(data.id, safe, { relationship: 'inherits' });
        }
      }
    } else {
      for (const entity of [...new Set(entities || [])]) {
        const safe = sanitizeName(entity);
        const entityId = `${data.id}::${safe}`;
        graph.addNode(entityId, { label: safe, kind: 'entity' });
        graph.addEdge(data.id, entityId, { relation: 'contains' });
      }
    }
  }

  // Resolve dependencies (with JS alias/file resolution)
  for (const data of parsedData) {
    const fromDir = path.dirname(path.resolve(process.cwd(), data.id));
    for (let dep of data.dependencies) {
      try {
        if (/\.(js|jsx|ts|tsx|mjs)$/.test(data.id) || dep.startsWith('@/') || dep.startsWith('.')) {
          const resolved = resolveJsImport(dep, fromDir);
          if (resolved && resolved !== dep) dep = resolved;
        }
      } catch {}
      let target = null;

      if (isRelative(dep)) {
        target = path.relative(process.cwd(), path.resolve(path.dirname(data.id), dep));
      } else {
        const localCandidate = path.relative(process.cwd(), path.resolve(path.dirname(data.id), dep));
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