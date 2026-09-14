#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function tryMcpQuery(pattern) {
  if (!pattern || pattern.length < 3) return null;
  const mcpPath = path.join(process.cwd(), '.mcp.json');
  try {
    if (!fs.existsSync(mcpPath)) return null;
    const raw = fs.readFileSync(mcpPath, 'utf-8');
    if (!JSON.parse(raw).mcpServers?.['codebase-vis']) return null;
  } catch { return null; }
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const child = spawn('npx', ['codebase-vis', 'serve', '--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch {} resolve(null); } }, 700);
    child.stdout.on('data', (d) => {
      out += d.toString();
      for (const line of out.split('\n').filter(Boolean)) {
        try {
          const msg = JSON.parse(line);
          if (msg.result?.structuredContent?.matches) {
            if (!done) { done = true; clearTimeout(timer); try { child.kill(); } catch {} resolve(msg.result.structuredContent.matches.map((m) => `[codebase-vis] ${m.kind || 'entity'} ${m.label || m.id} -> ${m.file || m.id}:${m.line || 1}`)); return; }
          }
        } catch {}
      }
    });
    child.on('error', () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    child.on('close', () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    try {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'hook', version: '1.0.0' } } }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query_symbol', arguments: { pattern, kind: 'all' } } }) + '\n');
    } catch { if (!done) { done = true; clearTimeout(timer); try { child.kill(); } catch {} resolve(null); } }
  });
}

async function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }
  if (!raw) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const command = payload?.tool_input?.command || payload?.tool_input?.tool_input?.command || '';

  if (!/\b(grep|rg|ripgrep|find|ag|ack)\b/.test(command)) process.exit(0);
  if (command.includes('--graph-tried') || command.includes('# graph-checked') || command.includes('# --graph-tried')) process.exit(0);

  const match = command.match(/(?:grep|rg|ripgrep|find|ag|ack)\s+(?:-[a-zA-Z]+\s+)*['"]?([a-zA-Z0-9_]{3,})['"]?/);
  const pattern = match ? match[1] : null;
  if (!pattern) process.exit(0);

  const mcpMatches = await tryMcpQuery(pattern);
  if (mcpMatches && mcpMatches.length > 0) {
    const response = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[codebase-vis] Graph already has this answer (no grep needed):\n\n` +
          `${mcpMatches.join('\n')}\n\n` +
          `Override: append "# --graph-tried" to command.`,
      },
    };
    console.log(JSON.stringify(response));
    process.exit(0);
  }

  const graphPath = path.join(process.cwd(), 'codebase-out', 'graph.json');
  if (!fs.existsSync(graphPath)) process.exit(0);

  try {
    const stat = fs.statSync(graphPath);
    if (stat.size > 20 * 1024 * 1024) process.exit(0);
  } catch {
    process.exit(0);
  }

  try {
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    const nodes = graph.nodes || [];
    const lower = pattern.toLowerCase();
    const matches = [];

    for (const node of nodes) {
      const attrs = node.attributes || node;
      const key = node.key || node.id || '';
      const label = String(attrs.label || node.label || key || '');
      if (!label.toLowerCase().includes(lower)) continue;
      const file = String(attrs.source_file || node.source_file || key || node.id || '');
      const line = attrs.line || node.line || 1;
      const kind = String(attrs.file_type || attrs.type || attrs.kind || 'entity');
      matches.push(`[codebase-vis] ${kind} ${label} -> ${file}:${line}`);
      if (matches.length >= 5) break;
    }

    if (matches.length > 0) {
      const response = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `[codebase-vis] Graph already has this answer (no grep needed):\n\n` +
            `${matches.join('\n')}\n\n` +
            `Override: append "# --graph-tried" to command.`,
        },
      };
      console.log(JSON.stringify(response));
    }
  } catch {
    process.exit(0);
  }
  process.exit(0);
}

main();
