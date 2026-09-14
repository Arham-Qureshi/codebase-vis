import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const START = '<!-- codebase-vis:hook:start -->';
const END = '<!-- codebase-vis:hook:end -->';
const BLOCK = `${START}
## codebase-vis Graph-First Search

Before running \`grep\`, \`rg\`, \`find\`, \`ag\`, or \`ack\`, check \`codebase-out/graph.json\` for the symbol.

If found, use the graph result inline and skip the shell search.

Escape hatch: append \`# --graph-tried\` to force raw search.

When \`codebase-out/graph.json\` is missing, run \`codebase-vis generate\` first.

${END}
`;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function installMarkdown(cwd, filename) {
  const dest = path.join(path.resolve(cwd || process.cwd()), filename);
  const root = path.resolve(cwd || process.cwd()) + path.sep;
  const resolved = path.resolve(dest);
  if (!resolved.startsWith(root) && resolved !== path.resolve(cwd || process.cwd())) {
    throw new Error(`Path outside cwd: ${dest}`);
  }
  let existing = '';
  try {
    existing = await fs.readFile(dest, 'utf-8');
  } catch {}
  if (existing.includes(START)) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
  await fs.writeFile(dest, existing + sep + BLOCK + '\n', 'utf-8');
}

async function uninstallMarkdown(cwd, filename) {
  const dest = path.join(path.resolve(cwd || process.cwd()), filename);
  try {
    let content = await fs.readFile(dest, 'utf-8');
    const re = new RegExp(`\\n?${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, 'g');
    content = content.replace(re, '\n');
    content = content.replace(/^\n+/, '');
    content = content.replace(/\n+$/, '');
    if (content.trim() === '') {
      try { await fs.unlink(dest); } catch {}
      return;
    }
    await fs.writeFile(dest, content + '\n', 'utf-8');
  } catch {}
}

function isInstalledMarkdown(cwd, filename) {
  try {
    return fsSync.readFileSync(path.join(path.resolve(cwd || process.cwd()), filename), 'utf-8').includes(START);
  } catch {
    return false;
  }
}

export const installCodex = (cwd) => installMarkdown(cwd, 'AGENTS.md');
export const installGemini = (cwd) => installMarkdown(cwd, 'GEMINI.md');
export const uninstallCodex = (cwd) => uninstallMarkdown(cwd, 'AGENTS.md');
export const uninstallGemini = (cwd) => uninstallMarkdown(cwd, 'GEMINI.md');
export const isInstalledCodex = (cwd) => isInstalledMarkdown(cwd, 'AGENTS.md');
export const isInstalledGemini = (cwd) => isInstalledMarkdown(cwd, 'GEMINI.md');
