import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import { getOutDirPath } from '../../utils/file-system.js';

// clean => safely deletes the codebase-out/ directory after confirmation
export async function cleanCommand() {
  p.intro(pc.bgRed(pc.white(' codebase-vis clean ')));

  const outDir = getOutDirPath();

  const shouldDelete = await p.confirm({
    message: `Are you sure you want to delete the ${pc.bold('codebase-out/')} directory?`,
  });

  // (ctrl+c)
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