import fs from 'node:fs/promises';
import path from 'node:path';
import { getOutDirPath } from '../utils/file-system.js';

const MAX_GRAPH_SIZE = 2 * 1024 * 1024;

function normalizeNode(node) {
  const attrs = node.attributes || node;
  const key = node.key || node.id || '';
  return {
    label: String(attrs.label || node.label || key || ''),
    id: String(key || node.id || ''),
    file: String(attrs.source_file || node.source_file || key || node.id || ''),
    line: attrs.line || node.line || attrs.source_location || 1,
    kind: String(attrs.file_type || attrs.type || attrs.kind || 'entity'),
  };
}

export async function queryGraph(pattern, graphPath) {
  if (!pattern || pattern.length < 3) return { matches: [], formatted: [] };
  const resolved = graphPath || path.join(getOutDirPath(), 'graph.json');
  let stat;
  try {
    stat = await fs.stat(resolved);
    if (stat.size > MAX_GRAPH_SIZE * 10) {
      return { matches: [], formatted: [] };
    }
  } catch {
    return { matches: [], formatted: [] };
  }
  let raw;
  try {
    raw = await fs.readFile(resolved, 'utf-8');
  } catch {
    return { matches: [], formatted: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { matches: [], formatted: [] };
  }
  const nodes = parsed.nodes || [];
  const lower = pattern.toLowerCase();
  const matches = [];
  const formatted = [];
  for (const node of nodes) {
    const norm = normalizeNode(node);
    const haystack = `${norm.label} ${norm.id}`.toLowerCase();
    if (!haystack.includes(lower)) continue;
    matches.push(norm);
    formatted.push(`[codebase-vis] ${norm.kind} ${norm.label} -> ${norm.file}:${norm.line}`);
    if (matches.length >= 5) break;
  }
  return { matches, formatted };
}
