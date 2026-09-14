import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

function sandboxCheck(cwd, target) {
  const resolved = path.resolve(target);
  const root = path.resolve(cwd) + path.sep;
  if (!resolved.startsWith(root) && resolved !== path.resolve(cwd)) {
    throw new Error(`Path outside cwd: ${target}`);
  }
}

const MCP_ENTRY = {
  command: 'npx',
  args: ['codebase-vis', 'serve', '--mcp'],
};

export async function installMcp(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const mcpPath = path.join(root, '.mcp.json');
  sandboxCheck(root, mcpPath);
  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(mcpPath, 'utf-8'));
  } catch {}
  existing.mcpServers = existing.mcpServers || {};
  existing.mcpServers['codebase-vis'] = MCP_ENTRY;
  await fs.mkdir(path.dirname(mcpPath), { recursive: true });
  await fs.writeFile(mcpPath, JSON.stringify(existing, null, 2), 'utf-8');
}

export function isInstalledMcp(cwd) {
  try {
    const raw = fsSync.readFileSync(path.join(path.resolve(cwd || process.cwd()), '.mcp.json'), 'utf-8');
    const data = JSON.parse(raw);
    return !!data.mcpServers?.['codebase-vis'];
  } catch {
    return false;
  }
}

export async function uninstallMcp(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const mcpPath = path.join(root, '.mcp.json');
  try {
    const raw = await fs.readFile(mcpPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data.mcpServers?.['codebase-vis']) {
      delete data.mcpServers['codebase-vis'];
      if (Object.keys(data.mcpServers).length === 0) delete data.mcpServers;
      if (Object.keys(data).length === 0) {
        await fs.unlink(mcpPath);
        return;
      }
      await fs.writeFile(mcpPath, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch {}
}
