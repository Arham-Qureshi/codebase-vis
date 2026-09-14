import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getOutDirPath } from '../utils/file-system.js';
import { queryGraph } from '../hook/query-engine.js';
import { loadGraph } from '../cli/shared.js';

export function createMcpServer({ cwd = process.cwd() } = {}) {
  const server = new McpServer({
    name: 'codebase-vis',
    version: '2.6.1',
  });

  server.registerTool('query_symbol', {
    description: 'Exact or fuzzy lookup for files, classes, functions, and methods',
    inputSchema: z.object({
      pattern: z.string().describe('Symbol or filename pattern to search for'),
      kind: z.enum(['file', 'class', 'function', 'method', 'all']).default('all').describe('Kind of symbol to filter'),
    }),
  }, async ({ pattern, kind }) => {
    const { matches, formatted } = await queryGraph(pattern);
    let filtered = matches;
    if (kind && kind !== 'all') {
      filtered = matches.filter(m => m.kind === kind || m.kind.toLowerCase() === kind.toLowerCase());
    }
    return {
      content: [{ type: 'text', text: formatted.join('\n') || `No matches for "${pattern}"` }],
      structuredContent: { matches: filtered, count: filtered.length },
    };
  });

  server.registerTool('query_dependencies', {
    description: 'Returns inbound (dependents) and outbound (dependencies) edges for a target node',
    inputSchema: z.object({
      target: z.string().describe("Target file path or entity ID (e.g. 'src/server/web.js')"),
      direction: z.enum(['inbound', 'outbound', 'both']).default('both').describe('Direction to query'),
    }),
  }, async ({ target, direction }) => {
    const graph = await loadGraph();
    if (!graph) {
      return { content: [{ type: 'text', text: 'graph.json not found. Run codebase-vis generate.' }], isError: true };
    }
    // Resolve target
    let resolved = target;
    if (!graph.hasNode(target)) {
      const rel = path.relative(process.cwd(), path.resolve(process.cwd(), target));
      if (graph.hasNode(rel)) resolved = rel;
      else {
        // fuzzy
        const lower = target.toLowerCase();
        let found = null;
        graph.forEachNode((id, attrs) => {
          if (!found && (id.toLowerCase().includes(lower) || (attrs.label || '').toLowerCase().includes(lower))) found = id;
        });
        if (found) resolved = found;
      }
    }
    if (!graph.hasNode(resolved)) {
      return { content: [{ type: 'text', text: `Node not found: ${target}` }], isError: true };
    }
    const inbound = direction !== 'outbound' ? graph.mapInNeighbors(resolved, (n) => n) : [];
    const outbound = direction !== 'inbound' ? graph.mapOutNeighbors(resolved, (n) => n) : [];
    const inEdges = direction !== 'outbound' ? graph.mapInEdges(resolved, (edge, attrs, source, target) => ({ source, target, attrs })) : [];
    const outEdges = direction !== 'inbound' ? graph.mapOutEdges(resolved, (edge, attrs, source, target) => ({ source, target, attrs })) : [];
    const text = `Target: ${resolved}\nInbound (${inbound.length}): ${inbound.join(', ')}\nOutbound (${outbound.length}): ${outbound.join(', ')}`;
    return {
      content: [{ type: 'text', text }],
      structuredContent: { target: resolved, inbound, outbound, inEdges, outEdges },
    };
  });

  server.registerTool('get_blast_radius', {
    description: 'Traces caller/dependent chains for changed files to calculate impact',
    inputSchema: z.object({
      changed_files: z.array(z.string()).describe('Array of modified file paths'),
      depth: z.number().int().min(1).max(3).default(2).describe('Max traversal depth'),
    }),
  }, async ({ changed_files, depth }) => {
    const graph = await loadGraph();
    if (!graph) {
      return { content: [{ type: 'text', text: 'graph.json not found. Run codebase-vis generate.' }], isError: true };
    }
    const visited = new Set(changed_files);
    let frontier = [...changed_files];
    let currentDepth = 0;
    const result = { direct: [], indirect: [] };
    while (frontier.length > 0 && currentDepth < depth) {
      const next = [];
      for (const node of frontier) {
        if (!graph.hasNode(node)) continue;
        const callers = graph.mapInNeighbors(node, n => n);
        for (const c of callers) {
          if (!visited.has(c)) {
            visited.add(c);
            next.push(c);
            if (currentDepth === 0) result.direct.push(c);
            else result.indirect.push(c);
          }
        }
      }
      frontier = next;
      currentDepth++;
    }
    const affected = Array.from(visited);
    const risk = affected.length > 20 ? 'high' : affected.length > 5 ? 'medium' : 'low';
    return {
      content: [{ type: 'text', text: `Risk: ${risk}, Affected: ${affected.length}, Direct: ${result.direct.length}, Indirect: ${result.indirect.length}\n${affected.join('\n')}` }],
      structuredContent: { risk, affected, direct: result.direct, indirect: result.indirect, count: affected.length },
    };
  });

  server.registerTool('find_shortest_path', {
    description: 'Calculates shortest dependency chain between two modules',
    inputSchema: z.object({
      source: z.string().describe('Source file path or symbol ID'),
      target: z.string().describe('Target file path or symbol ID'),
    }),
  }, async ({ source, target }) => {
    const graph = await loadGraph();
    if (!graph) {
      return { content: [{ type: 'text', text: 'graph.json not found. Run codebase-vis generate.' }], isError: true };
    }
    // Use bidirectional BFS similar to src/cli/commands/path.js
    const resolve = (t) => {
      if (graph.hasNode(t)) return t;
      const rel = path.relative(process.cwd(), path.resolve(process.cwd(), t));
      if (graph.hasNode(rel)) return rel;
      const lower = t.toLowerCase();
      let found = null;
      graph.forEachNode((id, attrs) => {
        if (!found && (id.toLowerCase().includes(lower) || (attrs.label || '').toLowerCase().includes(lower))) found = id;
      });
      return found || t;
    };
    const src = resolve(source);
    const tgt = resolve(target);
    if (!graph.hasNode(src) || !graph.hasNode(tgt)) {
      return { content: [{ type: 'text', text: `Node not found: ${!graph.hasNode(src) ? source : target}` }], isError: true };
    }
    // BFS
    const queue = [[src]];
    const visited = new Set([src]);
    let foundPath = null;
    while (queue.length > 0) {
      const path = queue.shift();
      const last = path[path.length - 1];
      if (last === tgt) { foundPath = path; break; }
      for (const neighbor of graph.outNeighbors(last) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
      // Also consider inNeighbors for undirected shortest path
      for (const neighbor of graph.inNeighbors(last) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
      if (queue.length > 1000) break;
    }
    if (!foundPath) {
      return { content: [{ type: 'text', text: `No path between ${source} and ${target}` }] };
    }
    return {
      content: [{ type: 'text', text: foundPath.join(' -> ') }],
      structuredContent: { path: foundPath, length: foundPath.length },
    };
  });

  server.registerTool('list_communities', {
    description: 'Lists architectural subsystem clusters from Louvain community detection',
    inputSchema: z.object({}),
  }, async () => {
    const graph = await loadGraph();
    if (!graph) {
      return { content: [{ type: 'text', text: 'graph.json not found. Run codebase-vis generate.' }], isError: true };
    }
    const communities = new Map();
    graph.forEachNode((id, attrs) => {
      const c = attrs.community || 'unknown';
      if (!communities.has(c)) communities.set(c, { id: c, members: 0, color: attrs.color || '#ccc', label: c });
      communities.get(c).members++;
    });
    const list = Array.from(communities.values());
    return {
      content: [{ type: 'text', text: list.map(c => `${c.id}: ${c.members} members, color ${c.color}`).join('\n') }],
      structuredContent: { communities: list, count: list.length },
    };
  });

  server.registerTool('get_community_details', {
    description: 'Returns member files and boundary edges for a community',
    inputSchema: z.object({
      community_id: z.string().describe("Community identifier (e.g., 'src/utils')"),
    }),
  }, async ({ community_id }) => {
    const graph = await loadGraph();
    if (!graph) {
      return { content: [{ type: 'text', text: 'graph.json not found. Run codebase-vis generate.' }], isError: true };
    }
    const members = [];
    graph.forEachNode((id, attrs) => {
      if ((attrs.community || '').toLowerCase() === community_id.toLowerCase() || attrs.community === community_id) {
        members.push({ id, label: attrs.label || id, kind: attrs.kind || 'file', language: attrs.language });
      }
    });
    if (members.length === 0) {
      // Try partial match
      graph.forEachNode((id, attrs) => {
        if ((attrs.community || '').toLowerCase().includes(community_id.toLowerCase())) {
          members.push({ id, label: attrs.label || id, kind: attrs.kind || 'file' });
        }
      });
    }
    const memberIds = new Set(members.map(m => m.id));
    const boundary = [];
    graph.forEachEdge((edge, attrs, source, target) => {
      const sourceIn = memberIds.has(source);
      const targetIn = memberIds.has(target);
      if (sourceIn !== targetIn) boundary.push({ source, target, attrs });
    });
    return {
      content: [{ type: 'text', text: `Community ${community_id}: ${members.length} members, ${boundary.length} boundary edges` }],
      structuredContent: { community_id, members, boundary, memberCount: members.length, boundaryCount: boundary.length },
    };
  });

  server.registerTool('detect_cycles', {
    description: 'Detects circular dependency loops',
    inputSchema: z.object({}),
  }, async () => {
    const graphPath = path.join(getOutDirPath(), 'cycles.json');
    try {
      const raw = await fs.readFile(graphPath, 'utf-8');
      const cycles = JSON.parse(raw);
      return {
        content: [{ type: 'text', text: cycles.length ? cycles.map(c => c.join(' -> ')).join('\n') : 'No cycles detected' }],
        structuredContent: { cycles, count: cycles.length },
      };
    } catch {}
    // Fallback: try to compute via cycle-detector if available
    try {
      const graph = await loadGraph();
      if (!graph) throw new Error('no graph');
      const { detectCycles } = await import('../graph/cycle-detector.js');
      const cycles = detectCycles(graph);
      return {
        content: [{ type: 'text', text: cycles.length ? cycles.map(c => c.join(' -> ')).join('\n') : 'No cycles detected' }],
        structuredContent: { cycles, count: cycles.length },
      };
    } catch (e) {
      return { content: [{ type: 'text', text: 'No cycles data. Run codebase-vis detect.' }] };
    }
  });

  server.registerTool('get_graph_stats', {
    description: 'Returns graph metadata, language breakdown, cache freshness',
    inputSchema: z.object({}),
  }, async () => {
    const graph = await loadGraph();
    if (!graph) {
      return { content: [{ type: 'text', text: 'graph.json not found. Run codebase-vis generate.' }], isError: true };
    }
    let stats = { nodes: graph.order, edges: graph.size };
    try {
      const { computeGlobalStats } = await import('../utils/stat-calculator.js');
      const s = computeGlobalStats(graph);
      stats = { ...stats, ...s };
    } catch {}
    let cacheInfo = null;
    try {
      const cachePath = path.join(getOutDirPath(), '.cache.json');
      const raw = await fs.readFile(cachePath, 'utf-8');
      const c = JSON.parse(raw);
      cacheInfo = { files: Object.keys(c.files || {}).length, version: c.version };
    } catch {}
    return {
      content: [{ type: 'text', text: `Nodes: ${stats.nodes}, Edges: ${stats.edges}\nLanguages: ${JSON.stringify(stats.languages || {})}` }],
      structuredContent: { ...stats, cache: cacheInfo },
    };
  });

  return server;
}

export async function startMcpServer({ cwd = process.cwd() } = {}) {
  const server = createMcpServer({ cwd });
  const { serveStdio } = await import('@modelcontextprotocol/server/stdio');
  await serveStdio(() => server);
  console.error('codebase-vis MCP running on stdio');
}

export async function startMcpServerWithTransport(transport, opts = {}) {
  const server = createMcpServer(opts);
  await server.connect(transport);
  return server;
}
