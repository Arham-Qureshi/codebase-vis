import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR_NAME = 'codebase-out';

// process.cwd => returns the dir where node js project is implemented
export function getOutDirPath() {
  return path.resolve(process.cwd(), OUT_DIR_NAME);
}

// safely creates codebase-out dir and recursive true => ensure sub-directories are also created
export async function createOutDir() {
  const outDir = getOutDirPath();
  await fs.mkdir(outDir, { recursive: true });
  return outDir;
}

// this function allows us to write file only if the resolved target path
export async function safeWriteFile(targetPath, data) {
  const resolvedTarget = path.resolve(targetPath);
  const sandboxRoot = getOutDirPath() + path.sep;

  if (!resolvedTarget.startsWith(sandboxRoot)) {
    throw new Error(
      `[SECURITY] Write blocked. Target path "${resolvedTarget}" is outside the sandbox directory "${sandboxRoot}". ` +
      `All writes must be within the codebase-out/ directory.`
    );
  }

  // Ensure any nested subdirectories exist before writing
  const targetDir = path.dirname(resolvedTarget);
  await fs.mkdir(targetDir, { recursive: true });

  await fs.writeFile(resolvedTarget, data, 'utf-8');
}