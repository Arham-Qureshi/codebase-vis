import path from 'node:path';

const ENTITY_KINDS = new Set(['class', 'function', 'method', 'entity']);

function isFileNode(attrs) {
  return !attrs.external && !ENTITY_KINDS.has(attrs.kind);
}

function classifyNodes(graph) {
  let files = 0, entities = 0, classes = 0, functions = 0, methods = 0, externals = 0, npmPackages = 0;

  graph.forEachNode((node, attrs) => {
    if (attrs.external) {
      externals++;
      if (attrs.npm) npmPackages++;
    } else if (ENTITY_KINDS.has(attrs.kind)) {
      entities++;
      if (attrs.kind === 'class') classes++;
      else if (attrs.kind === 'function') functions++;
      else if (attrs.kind === 'method') methods++;
    } else {
      files++;
    }
  });

  return {
    fileNodes: files,
    entityNodes: entities,
    entityBreakdown: { classes, functions, methods },
    externalPackages: externals,
    npmPackages,
  };
}

function countEdgeTypes(graph) {
  let depEdges = 0, containsEdges = 0;

  graph.forEachEdge((edge, attrs) => {
    if (attrs.relation === 'contains') {
      containsEdges++;
    } else {
      depEdges++;
    }
  });

  return { dependencyEdges: depEdges, containsEdges };
}

function computeLanguageBreakdown(graph) {
  const langMap = new Map();

  graph.forEachNode((node, attrs) => {
    if (attrs.external || ENTITY_KINDS.has(attrs.kind)) return;

    const lang = attrs.language || 'Unknown';
    if (!langMap.has(lang)) langMap.set(lang, { files: 0, totalDeps: 0, entities: 0 });
    const entry = langMap.get(lang);
    entry.files++;

    graph.forEachOutNeighbor(node, (neighbor, nAttrs) => {
      if (ENTITY_KINDS.has(nAttrs.kind)) {
        entry.entities++;
      } else {
        entry.totalDeps++;
      }
    });
  });

  return Array.from(langMap.entries())
    .map(([language, data]) => ({ language, ...data }))
    .sort((a, b) => b.files - a.files);
}

function computeHotspots(graph, topN) {
  const mostImported = [];
  const heaviestImporters = [];
  const largestFiles = [];

  graph.forEachNode((node, attrs) => {
    if (!isFileNode(attrs)) return;

    let depIn = 0, depOut = 0, entityCount = 0;
    graph.forEachOutNeighbor(node, (neighbor, nAttrs) => {
      if (ENTITY_KINDS.has(nAttrs.kind)) {
        entityCount++;
      } else {
        depOut++;
      }
    });
    graph.forEachInNeighbor(node, (neighbor, nAttrs) => {
      if (!ENTITY_KINDS.has(nAttrs.kind)) depIn++;
    });

    const label = attrs.label || path.basename(node);

    if (depIn > 0) mostImported.push({ id: node, label, dependents: depIn });
    if (depOut > 0) heaviestImporters.push({ id: node, label, dependencies: depOut });
    if (entityCount > 0) largestFiles.push({ id: node, label, entities: entityCount });
  });

  const sortDesc = (arr, key) => arr.sort((a, b) => b[key] - a[key]);

  return {
    mostImported: sortDesc(mostImported, 'dependents').slice(0, topN),
    heaviestImporters: sortDesc(heaviestImporters, 'dependencies').slice(0, topN),
    largestFiles: sortDesc(largestFiles, 'entities').slice(0, topN),
  };
}

function getMaxDepChain(graph) {
  const fileNodes = [];
  graph.forEachNode((node, attrs) => {
    if (isFileNode(attrs)) fileNodes.push(node);
  });

  const fileSet = new Set(fileNodes);
  let maxDepth = 0;

  for (const node of fileNodes) {
    let inDegreeFromFiles = 0;
    graph.forEachInNeighbor(node, (neighbor, nAttrs) => {
      if (fileSet.has(neighbor)) inDegreeFromFiles++;
    });

    if (inDegreeFromFiles === 0) {
      const queue = [{ node, depth: 0 }];
      const visited = new Set([node]);

      while (queue.length > 0) {
        const { node: current, depth } = queue.shift();
        if (depth > maxDepth) maxDepth = depth;

        graph.forEachOutNeighbor(current, (neighbor, nAttrs) => {
          if (fileSet.has(neighbor) && !visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ node: neighbor, depth: depth + 1 });
          }
        });
      }
    }
  }

  return maxDepth;
}

function getCrossModuleEdges(graph) {
  let crossCount = 0;
  let totalFileEdges = 0;

  graph.forEachEdge((edge, attrs, source, target) => {
    const sAttrs = graph.getNodeAttributes(source);
    const tAttrs = graph.getNodeAttributes(target);
    if (!isFileNode(sAttrs) || !isFileNode(tAttrs)) return;

    totalFileEdges++;
    if (sAttrs.community !== tAttrs.community) crossCount++;
  });

  return {
    crossCommunityEdges: crossCount,
    totalFileToFileEdges: totalFileEdges,
    crossCommunityPct: totalFileEdges > 0
      ? parseFloat(((crossCount / totalFileEdges) * 100).toFixed(1))
      : 0,
  };
}

function computeHealth(graph) {
  let fileCount = 0;
  let totalDepEdges = 0;
  let totalEntities = 0;
  const isolated = [];

  graph.forEachNode((node, attrs) => {
    if (!isFileNode(attrs)) return;
    fileCount++;

    let fileDeps = 0;
    graph.forEachOutNeighbor(node, (neighbor, nAttrs) => {
      if (ENTITY_KINDS.has(nAttrs.kind)) {
        totalEntities++;
      } else {
        fileDeps++;
      }
    });
    totalDepEdges += fileDeps;

    let hasIncoming = false;
    graph.forEachInNeighbor(node, (neighbor, nAttrs) => {
      if (!ENTITY_KINDS.has(nAttrs.kind)) hasIncoming = true;
    });

    if (fileDeps === 0 && !hasIncoming) {
      isolated.push(node);
    }
  });

  return {
    isolatedFiles: isolated.length,
    isolatedList: isolated,
    avgDepsPerFile: fileCount > 0
      ? parseFloat((totalDepEdges / fileCount).toFixed(1))
      : 0,
    entityDensity: fileCount > 0
      ? parseFloat((totalEntities / fileCount).toFixed(2))
      : 0,
    maxDepChain: getMaxDepChain(graph),
  };
}

function getNodeCycles(cycles, nodeId) {
  if (!cycles || cycles.length === 0) return [];

  const result = [];
  for (const cycle of cycles) {
    const inCycle = cycle.files && cycle.files.some(f => f.id === nodeId);
    if (inCycle) result.push(cycle.id);
  }
  return result;
}

function buildDirectoryBreakdown(graph) {
  const dirMap = new Map();

  graph.forEachNode((node, attrs) => {
    if (!isFileNode(attrs)) return;

    const dir = path.dirname(node);
    if (!dirMap.has(dir)) {
      dirMap.set(dir, { dir, files: 0 });
    }
    dirMap.get(dir).files++;
  });

  return Array.from(dirMap.values())
    .sort((a, b) => b.files - a.files);
}

export function computeGlobalStats(graph, options = {}) {
  const { verbose = false, topN = 5, cycles = null } = options;

  const composition = classifyNodes(graph);
  const edgeTypes = countEdgeTypes(graph);
  const languages = computeLanguageBreakdown(graph);
  const hotspots = computeHotspots(graph, topN);
  const health = computeHealth(graph);
  const coupling = getCrossModuleEdges(graph);
  const directories = buildDirectoryBreakdown(graph);

  const result = {
    composition: {
      ...composition,
      ...edgeTypes,
      communities: composition.communities || 0,
      directories: directories.length,
      crossCommunityEdges: coupling.crossCommunityEdges,
      crossCommunityPct: coupling.crossCommunityPct,
      totalFileToFileEdges: coupling.totalFileToFileEdges,
    },
    languages,
    hotspots,
    health: {
      isolatedFiles: health.isolatedFiles,
      avgDepsPerFile: health.avgDepsPerFile,
      entityDensity: health.entityDensity,
      maxDepChain: health.maxDepChain,
      circularDeps: cycles ? cycles.length : null,
      crossCommunityEdges: coupling.crossCommunityEdges,
      crossCommunityPct: coupling.crossCommunityPct,
    },
    directories,
  };

  if (verbose) {
    result.health.isolatedList = health.isolatedList;
  }

  return result;
}

export function computeTargetStats(graph, nodeId, options = {}) {
  const { verbose = false, cycles = null } = options;

  if (!graph.hasNode(nodeId)) return null;

  const attrs = graph.getNodeAttributes(nodeId);
  const label = attrs.label || path.basename(nodeId);

  let type, kind, language, community;
  let entities = null;
  let entityList = null;
  let parentFile = null;

  if (attrs.external) {
    type = 'external';
    kind = null;
    language = null;
    community = attrs.community || 'dependencies';
  } else if (ENTITY_KINDS.has(attrs.kind)) {
    type = 'entity';
    kind = attrs.kind;
    const sepIdx = nodeId.lastIndexOf('::');
    parentFile = sepIdx !== -1 ? nodeId.slice(0, sepIdx) : nodeId;
    const parentAttrs = graph.hasNode(parentFile) ? graph.getNodeAttributes(parentFile) : null;
    language = parentAttrs ? parentAttrs.language : null;
    community = attrs.community || (parentAttrs ? parentAttrs.community : null);
  } else {
    type = 'file';
    kind = null;
    language = attrs.language || null;
    community = attrs.community || null;
  }

  const inDeg = graph.inDegree(nodeId);
  const outDeg = graph.outDegree(nodeId);

  let dependencies = 0;
  let dependents = 0;
  graph.forEachOutNeighbor(nodeId, (neighbor, nAttrs) => {
    if (!ENTITY_KINDS.has(nAttrs.kind)) dependencies++;
  });
  graph.forEachInNeighbor(nodeId, (neighbor, nAttrs) => {
    if (!ENTITY_KINDS.has(nAttrs.kind)) dependents++;
  });

  if (type === 'file') {
    let c = 0, f = 0, m = 0;
    const list = [];
    graph.forEachOutNeighbor(nodeId, (neighbor, nAttrs) => {
      if (ENTITY_KINDS.has(nAttrs.kind)) {
        const entKind = nAttrs.kind || 'entity';
        if (entKind === 'class') c++;
        else if (entKind === 'function') f++;
        else if (entKind === 'method') m++;
        list.push({ name: nAttrs.label || neighbor, kind: entKind });
      }
    });
    entities = { classes: c, functions: f, methods: m, total: list.length };
    if (verbose) entityList = list;
  }

  const nodeCycles = getNodeCycles(cycles, nodeId);

  const isIsolated = dependencies === 0 && dependents === 0;

  const result = {
    id: nodeId,
    label,
    type,
    kind,
    language,
    community,
    degree: { in: inDeg, out: outDeg, total: inDeg + outDeg },
    dependencies,
    dependents,
    isIsolated,
    cycles: nodeCycles,
  };

  if (parentFile) result.parentFile = parentFile;
  if (entities) result.entities = entities;
  if (verbose && entityList) result.entityList = entityList;
  if (attrs.npm !== undefined) result.npm = attrs.npm;

  return result;
}