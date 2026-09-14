import type { Plugin } from "@opencode-ai/plugin";

async function tryMcpQuery(pattern: string, directory: string, timeout = 700): Promise<string[] | null> {
  if (!pattern || pattern.length < 3) return null;
  try {
    const mcpRaw = await Bun.file(`${directory}/.mcp.json`).text();
    if (!JSON.parse(mcpRaw).mcpServers?.['codebase-vis']) return null;
  } catch { return null; }
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    try {
      const proc = Bun.spawn(['npx', 'codebase-vis', 'serve', '--mcp'], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', cwd: directory } as any);
      const timer = setTimeout(() => { if (!done) { done = true; try { proc.kill(); } catch {} resolve(null); } }, timeout);
      (async () => {
        const reader = proc.stdout as any;
        // Bun stdout is readable, poll
        const interval = setInterval(async () => {
          try {
            const chunk = await proc.stdout.text();
            if (chunk) out += chunk;
            for (const line of out.split('\n').filter(Boolean)) {
              try {
                const msg = JSON.parse(line);
                if (msg.result?.structuredContent?.matches) {
                  if (!done) { done = true; clearTimeout(timer); clearInterval(interval); try { proc.kill(); } catch {} resolve(msg.result.structuredContent.matches.map((m: any) => `[codebase-vis] ${m.kind || 'entity'} ${m.label || m.id} -> ${m.file || m.id}:${m.line || 1}`)); return; }
                }
              } catch {}
            }
          } catch {}
        }, 100);
        setTimeout(() => clearInterval(interval), timeout + 100);
      })();
      proc.on('exit', () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
      try {
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'hook', version: '1.0.0' } } }) + '\n');
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query_symbol', arguments: { pattern, kind: 'all' } } }) + '\n');
        proc.stdin.flush();
      } catch { if (!done) { done = true; clearTimeout(timer); try { proc.kill(); } catch {} resolve(null); } }
    } catch { if (!done) { done = true; resolve(null); } }
  });
}

export const CodebaseVisHook: Plugin = async ({ directory }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return;
      const command: string = output.args?.command || "";
      if (!/\b(grep|rg|ripgrep|find|ag|ack)\b/.test(command)) return;
      if (command.includes("--graph-tried") || command.includes("# graph-checked") || command.includes("# --graph-tried")) return;
      const m = command.match(/(?:grep|rg|ripgrep|find|ag|ack)\s+(?:-[a-zA-Z]+\s+)*['"]?([a-zA-Z0-9_]{3,})['"]?/);
      const pattern = m?.[1];
      if (!pattern) return;
      const mcpMatches = await tryMcpQuery(pattern, directory);
      if (mcpMatches && mcpMatches.length > 0) {
        throw new Error(`[codebase-vis] Graph already has this answer (no grep needed):\n\n${mcpMatches.join("\n")}\n\nOverride: append "# --graph-tried" to command.`);
      }
      const graphPath = `${directory}/codebase-out/graph.json`;
      try {
        const graph = JSON.parse(await Bun.file(graphPath).text());
        const lower = pattern.toLowerCase();
        const matches = (graph.nodes || [])
          .filter((n: any) => {
            const label = (n.attributes?.label || n.label || n.key || n.id || "").toString().toLowerCase();
            return label.includes(lower);
          })
          .slice(0, 5)
          .map((n: any) => {
            const label = n.attributes?.label || n.label || n.key || n.id;
            const file = n.attributes?.source_file || n.source_file || n.key || n.id;
            const line = n.attributes?.line || n.line || 1;
            const kind = n.attributes?.kind || n.file_type || n.type || "entity";
            return `[codebase-vis] ${kind} ${label} -> ${file}:${line}`;
          });
        if (matches.length > 0) {
          throw new Error(
            `[codebase-vis] Graph already has this answer (no grep needed):\n\n${matches.join("\n")}\n\nOverride: append "# --graph-tried" to command.`
          );
        }
      } catch (err: any) {
        if (err.message?.includes("[codebase-vis]")) throw err;
      }
    },
  };
};
