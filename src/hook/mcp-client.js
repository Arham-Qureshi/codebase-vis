import { spawn } from 'node:child_process';
import fs from 'node:fs';

export function formatMatches(matches) {
  return matches.slice(0, 5).map((m) => {
    const label = m.label || m.id || '';
    const file = m.file || m.id || '';
    const line = m.line || 1;
    const kind = m.kind || 'entity';
    return `[codebase-vis] ${kind} ${label} -> ${file}:${line}`;
  });
}

export async function tryMcpQuery(pattern, cwd = process.cwd(), timeout = 700) {
  if (!pattern || pattern.length < 3) return null;
  if (pattern.includes('--graph-tried') || pattern.includes('# graph-checked') || pattern.includes('# --graph-tried')) return null;
  const mcpPath = `${cwd}/.mcp.json`;
  try {
    if (!fs.existsSync(mcpPath)) return null;
    const raw = fs.readFileSync(mcpPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.mcpServers?.['codebase-vis']) return null;
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    let stdout = '';
    let resolved = false;
    const child = spawn('npx', ['codebase-vis', 'serve', '--mcp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { child.kill(); } catch {}
        resolve(null);
      }
    }, timeout);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.result?.structuredContent?.matches) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              try { child.kill(); } catch {}
              resolve(msg.result.structuredContent.matches);
              return;
            }
          }
          if (msg.result?.content) {
            // Fallback: try to parse content text as JSON if it contains matches
          }
        } catch {}
      }
    });

    child.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    });

    child.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    });

    try {
      const init = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'hook', version: '1.0.0' } } }) + '\n';
      const call = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query_symbol', arguments: { pattern, kind: 'all' } } }) + '\n';
      child.stdin.write(init);
      child.stdin.write(call);
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try { child.kill(); } catch {}
        resolve(null);
      }
    }
  });
}
