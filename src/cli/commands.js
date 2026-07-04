import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createOutDir, getOutDirPath } from '../utils/file-system.js';

// default conatined in agent ingore file
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
    // file already exists
    p.log.warn(pc.yellow('.agentignore already exists. Aborting to prevent overwriting.'));
    p.outro(pc.dim('Edit the existing .agentignore file, then run ') + pc.cyan('agent-context generate'));
    return;
  } catch {
    // file does not exist — create it
  }

  const s = p.spinner();
  s.start('Creating .agentignore');

  const content = `# agent-context ignore file\n# Add paths below to exclude from parsing\n\n${DEFAULT_IGNORES.join('\n')}\n`;
  await fs.writeFile(agentignorePath, content, 'utf-8');

  s.stop(pc.green('.agentignore created successfully'));
  p.outro(pc.dim('Edit the file to customise, then run ') + pc.cyan('agent-context generate'));
}

// generate => the primary workhorse, currently scaffolds the output directory
export async function generateCommand() {
  console.clear();
  p.intro(pc.bgCyan(pc.black(' agent-context generate ')));

  const s = p.spinner();
  s.start('Setting up output directory');

  const outDir = await createOutDir();

  s.stop(pc.green(`Output directory ready at ${pc.bold(outDir)}`));
  p.outro(pc.green('✔') + pc.dim(' Generation complete. Run ') + pc.cyan('agent-context serve') + pc.dim(' to view.'));
}

// clean => safely deletes the codebase-out/ directory after confirmation
export async function cleanCommand() {
  p.intro(pc.bgRed(pc.white(' agent-context clean ')));

  const outDir = getOutDirPath();

  const shouldDelete = await p.confirm({
    message: `Are you sure you want to delete the ${pc.bold('codebase-out/')} directory?`,
  });

  // user cancelled (ctrl+c) or said no
  if (p.isCancel(shouldDelete) || !shouldDelete) {
    p.outro(pc.dim('Clean cancelled. No files were deleted.'));
    return;
  }

  const s = p.spinner();
  s.start('Deleting codebase-out/');

  await fs.rm(outDir, { recursive: true, force: true });

  s.stop(pc.green('codebase-out/ deleted successfully'));
  p.outro(pc.green('✔') + pc.dim(' Clean complete.'));
}