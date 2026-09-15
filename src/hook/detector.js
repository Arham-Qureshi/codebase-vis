import fs from 'node:fs';
import path from 'node:path';

export function detectWorkspace(cwd) {
  const root = cwd ? path.resolve(cwd) : process.cwd();
  return {
    claude: fs.existsSync(path.join(root, '.claude')),
    cursor: fs.existsSync(path.join(root, '.cursor')),
    opencode:
      fs.existsSync(path.join(root, '.opencode')) ||
      fs.existsSync(path.join(root, 'opencode.json')) ||
      fs.existsSync(path.join(root, 'opencode.jsonc')),
    copilot: fs.existsSync(path.join(root, '.github')),
    gemini: fs.existsSync(path.join(root, 'GEMINI.md')) || fs.existsSync(path.join(root, '.gemini')),
    mcp: true,
  };
}
