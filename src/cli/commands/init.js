import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_IGNORES = [
  'node_modules/',
  'dist/',
  'build/',
  '.git/',
  '.next/',
  'coverage/',
  '.env',
  'codebase-out/',
];

// init => sets up .agentignore in the user's project root
export async function initCommand() {
  const agentignorePath = path.resolve(process.cwd(), '.agentignore');

  p.intro(pc.bgCyan(pc.black(' agent-context init ')));

  try {
    await fs.access(agentignorePath);
    p.log.warn(pc.yellow('.agentignore already exists. Aborting to prevent overwriting.'));
    p.outro(pc.dim('Edit the existing .agentignore file, then run ') + pc.cyan('agent-context generate'));
    return;
  } catch {
  }

  const s = p.spinner();
  s.start('Creating .agentignore');

  const content = `# agent-context ignore file\n# Add paths below to exclude from parsing\n\n${DEFAULT_IGNORES.join('\n')}\n`;
  await fs.writeFile(agentignorePath, content, 'utf-8');

  s.stop(pc.green('.agentignore created successfully'));
  p.outro(pc.dim('Edit the file to customise, then run ') + pc.cyan('agent-context generate'));
}