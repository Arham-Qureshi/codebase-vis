import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';

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

export async function safeWriteFile(targetPath, data) {
  const resolvedTarget = path.resolve(targetPath);
  let sandboxRoot;
  try {
    sandboxRoot = await fs.realpath(getOutDirPath()) + path.sep;
  } catch {
    sandboxRoot = getOutDirPath() + path.sep;
  }

  if (!resolvedTarget.startsWith(sandboxRoot)) {
    const relTarget = path.relative(process.cwd(), resolvedTarget);
    const relSandbox = path.relative(process.cwd(), sandboxRoot);
    const stack = new Error().stack?.split('\n').slice(2, 4).join(' -> ') || 'unknown';
    logger.warn('FileSystem', `Write blocked — target="${relTarget}", sandbox="${relSandbox}", caller=${stack}`);
    throw new Error(
      `[SECURITY] Write blocked. Target path "${relTarget}" is outside the output directory "${relSandbox}".`
    );
  }

  const targetDir = path.dirname(resolvedTarget);
  await fs.mkdir(targetDir, { recursive: true });

  const sizeKb = Math.round(Buffer.byteLength(data, 'utf-8') / 1024);
  await fs.writeFile(resolvedTarget, data, 'utf-8');
  logger.debug('FileSystem', `Wrote ${sizeKb}KB to ${path.relative(process.cwd(), resolvedTarget)}`);
}