import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const MDC_CONTENT = `---
description: codebase-vis graph-first search
globs: ["**/*"]
alwaysApply: true
---

# codebase-vis: Graph-First Search

Before running \`grep\`, \`rg\`, \`find\`, \`ag\`, or \`ack\`, query \`codebase-out/graph.json\` for the symbol.

If found, use the graph answer inline and skip the shell search.

Escape hatch: append \`# --graph-tried\` to force raw search.

When \`codebase-out/graph.json\` is missing, run \`codebase-vis generate\` first.
`;

function sandboxCheck(cwd, target) {
  const resolved = path.resolve(target);
  const root = path.resolve(cwd) + path.sep;
  if (!resolved.startsWith(root) && resolved !== path.resolve(cwd)) {
    throw new Error(`Path outside cwd: ${target}`);
  }
}

export async function installCursor(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const dest = path.join(root, '.cursor', 'rules', 'codebase-vis.mdc');
  sandboxCheck(root, dest);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, MDC_CONTENT, 'utf-8');
}

export function isInstalledCursor(cwd) {
  try {
    fsSync.statSync(path.join(path.resolve(cwd || process.cwd()), '.cursor', 'rules', 'codebase-vis.mdc'));
    return true;
  } catch {
    return false;
  }
}

async function tryRemoveEmptyDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    if (entries.length === 0) await fs.rmdir(dirPath);
  } catch {}
}

export async function uninstallCursor(cwd) {
  const dest = path.join(path.resolve(cwd || process.cwd()), '.cursor', 'rules', 'codebase-vis.mdc');
  try {
    await fs.unlink(dest);
  } catch {}
  await tryRemoveEmptyDir(path.join(path.resolve(cwd || process.cwd()), '.cursor', 'rules'));
  await tryRemoveEmptyDir(path.join(path.resolve(cwd || process.cwd()), '.cursor'));
}
