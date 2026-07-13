import * as p from '@clack/prompts';
import pc from 'picocolors';
import Graph from 'graphology';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getOutDirPath } from '../utils/file-system.js';

// Convert an absolute node ID to a project-relative path
export function toRelative(nodeId) {
  return path.relative(process.cwd(), nodeId) || nodeId;
}

// color based on its type (blue-> file, yellow-> package, green-> class, magenta-> function/entity)
export function formatNodeLabel(nodeId, attrs) {
  if (attrs.external) return pc.yellow(nodeId);
  if (attrs.kind === 'class') return pc.green(attrs.label || nodeId);
  if (attrs.kind === 'function' || attrs.kind === 'entity') return pc.magenta(attrs.label || nodeId);
  return pc.cyan(toRelative(nodeId));
}

// Load graph.json into a live Graphology instance
export async function loadGraph() {
  const graphPath = path.join(getOutDirPath(), 'graph.json');
  try {
    await fs.access(graphPath);
  } catch {
    return null;
  }
  const raw = await fs.readFile(graphPath, 'utf-8');
  const graph = new Graph({ multi: true, directed: true });
  graph.import(JSON.parse(raw));
  return graph;
}

export function resetTimer() {
  process.__codebaseVisStartTime = Date.now();
}

export async function resolveNode(graph, target) {
  if (graph.hasNode(target)) return target;

  const resolved = path.resolve(process.cwd(), target);
  if (graph.hasNode(resolved)) return resolved;

  // Partial match
  const query = target.toLowerCase();
  const matches = [];
  graph.forEachNode((id, attrs) => {
    const label = (attrs.label || id).toLowerCase();
    if (id.toLowerCase().includes(query) || label.includes(query)) {
      matches.push({ id, label: attrs.label || id });
    }
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;

  const selected = await p.select({
    message: `Multiple matches for "${target}". Select a node:`,
    options: matches.slice(0, 25).map(m => ({
      value: m.id,
      label: m.label,
      hint: m.id !== m.label ? pc.dim(toRelative(m.id)) : undefined,
    })),
  });

  if (p.isCancel(selected)) return undefined; // user cancelled
  return selected;
}