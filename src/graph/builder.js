import Graph from 'graphology';
import path from 'node:path';
import fs from 'node:fs';
import { enrichNodes } from './enricher.js';
import { resolveJsImport } from '../parser/resolver.js';
import { getParserForFile } from '../parser/package-file-parser.js';
import { logger } from '../utils/logger.js';

const MAX_NODES = 500000;

const CATEGORY_LABELS = {
  dependencies: 'Dependencies',
  devDependencies: 'Dev Dependencies',
  peerDependencies: 'Peer Dependencies',
  optionalDependencies: 'Optional Dependencies',
  require: 'Dependencies',
  'require-dev': 'Dev Dependencies',
  build_dependencies: 'Build Dependencies',
  dev_dependencies: 'Dev Dependencies',
};

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

function addPackageFileNodes(graph, data, packageResult) {
  const { metadata, dependencies } = packageResult;
  const fileId = data.id;

  // Create metadata nodes
  const META_FIELDS = ['name', 'version', 'description', 'repository', 'license', 'author', 'homepage'];
  for (const field of META_FIELDS) {
    if (metadata[field]) {
      const metaNodeId = `${fileId}::meta::${field}`;
      if (!graph.hasNode(metaNodeId)) {
        graph.addNode(metaNodeId, {
          label: `${field}: ${metadata[field]}`,
          kind: 'pkg-metadata',
          metaField: field,
          metaValue: metadata[field],
          depth: 1,
        });
        graph.addEdge(fileId, metaNodeId, { relationship: 'contains' });
      }
    }
  }

  // Keywords
  if (Array.isArray(metadata.keywords) && metadata.keywords.length > 0) {
    const kwGroupId = `${fileId}::meta::keywords`;
    if (!graph.hasNode(kwGroupId)) {
      graph.addNode(kwGroupId, {
        label: 'Keywords',
        kind: 'pkg-category',
        depth: 1,
      });
      graph.addEdge(fileId, kwGroupId, { relationship: 'contains' });
    }
    for (const kw of metadata.keywords) {
      const kwNodeId = `${fileId}::keyword::${sanitizeName(kw)}`;
      if (!graph.hasNode(kwNodeId)) {
        graph.addNode(kwNodeId, {
          label: kw,
          kind: 'keyword',
          depth: 2,
        });
        graph.addEdge(kwGroupId, kwNodeId, { relationship: 'contains' });
      }
    }
  }

  // Scripts
  if (metadata.scripts && typeof metadata.scripts === 'object') {
    const scriptGroupId = `${fileId}::meta::scripts`;
    if (!graph.hasNode(scriptGroupId)) {
      graph.addNode(scriptGroupId, {
        label: 'Scripts',
        kind: 'pkg-category',
        depth: 1,
      });
      graph.addEdge(fileId, scriptGroupId, { relationship: 'contains' });
    }
    for (const [name, command] of Object.entries(metadata.scripts)) {
      const scriptNodeId = `${fileId}::script::${sanitizeName(name)}`;
      if (!graph.hasNode(scriptNodeId)) {
        graph.addNode(scriptNodeId, {
          label: `${name}: ${command}`,
          kind: 'script',
          scriptName: name,
          scriptCommand: command,
          depth: 2,
        });
        graph.addEdge(scriptGroupId, scriptNodeId, { relationship: 'contains' });
      }
    }
  }

  // Dependencies — hierarchical category grouping
  for (const [category, deps] of Object.entries(dependencies)) {
    if (!deps || Object.keys(deps).length === 0) continue;

    const catNodeId = `${fileId}::cat::${category}`;
    const catLabel = CATEGORY_LABELS[category] || category;

    if (!graph.hasNode(catNodeId)) {
      graph.addNode(catNodeId, {
        label: catLabel,
        kind: 'pkg-category',
        depCategory: category,
        depth: 1,
      });
      graph.addEdge(fileId, catNodeId, { relationship: 'contains' });
    }

    for (const [name, version] of Object.entries(deps)) {
      const safe = sanitizeName(name);
      const depNodeId = `dep::${safe}`;
      if (!graph.hasNode(depNodeId)) {
        graph.addNode(depNodeId, {
          label: name,
          kind: 'dependency',
          depType: category,
          version: version,
          depth: 2,
        });
      }
      graph.addEdge(catNodeId, depNodeId, { relationship: 'contains', depType: category });
    }
  }
}

export function buildGraph(parsedData, options = {}) {
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
  }

  for (const data of parsedData) {
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

      if (entities.markdownHierarchy && entities.markdownHierarchy.length > 0) {
        for (let i = 0; i < entities.markdownHierarchy.length; i++) {
          const heading = entities.markdownHierarchy[i];
          const safe = sanitizeName(heading.title);
          const headingNodeId = `${data.id}::heading::${safe}`;
          if (!graph.hasNode(headingNodeId)) {
            graph.addNode(headingNodeId, {
              label: heading.title,
              kind: 'heading',
              headingLevel: heading.depth,
              depth: Math.min(heading.depth, 3),
              parent: data.id
            });
            graph.addEdge(data.id, headingNodeId, {
              relationship: 'contains',
              depth: 1
            });
          }
          if (i > 0) {
            const prevHeading = entities.markdownHierarchy[i - 1];
            if (prevHeading.depth <= heading.depth) {
              const prevSafe = sanitizeName(prevHeading.title);
              const prevNodeId = `${data.id}::heading::${prevSafe}`;
              if (graph.hasNode(prevNodeId)) {
                graph.addEdge(prevNodeId, headingNodeId, {
                  relationship: 'next_section'
                });
              }
            }
          }
        }
      }

      if (entities.markdownLinks && entities.markdownLinks.length > 0) {
        for (const link of entities.markdownLinks) {
          if (link.type === 'relative' && (link.target.endsWith('.md') || link.target.endsWith('.mdx'))) {
            const targetPath = path.relative(process.cwd(), path.resolve(path.dirname(data.id), link.target));
            if (graph.hasNode(targetPath)) {
              graph.addEdge(data.id, targetPath, {
                relationship: 'links_to',
                linkText: link.text
              });
            }
          }
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

  // Add package file nodes (hierarchical metadata + dependencies)
  for (const data of parsedData) {
    const parser = getParserForFile(data.id);
    if (!parser) continue;

    try {
      const content = fs.readFileSync(path.join(process.cwd(), data.id), 'utf8');
      const result = parser(content);
      if (result && (Object.keys(result.metadata).length > 0 || Object.keys(result.dependencies).length > 0)) {
        addPackageFileNodes(graph, data, result);
      }
    } catch (e) {
      logger.debug('Builder', `Package file parsing failed for ${data.id}: ${e.message}`);
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
      } catch (e) {
        logger.debug('Builder', `Import resolution failed for "${dep}" in ${data.id}: ${e.message}`);
      }
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
