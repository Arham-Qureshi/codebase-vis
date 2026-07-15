import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir;
let origCwd;

before(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-fs-'));
  process.chdir(tmpDir);
});

after(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('getOutDirPath returns absolute path ending with codebase-out', async () => {
  const { getOutDirPath } = await import('../../src/utils/file-system.js');
  const outPath = getOutDirPath();
  assert.ok(outPath.endsWith('codebase-out'));
  assert.ok(path.isAbsolute(outPath));
  assert.equal(outPath, path.resolve(tmpDir, 'codebase-out'));
});

test('getOutDirPath is consistent across multiple calls', async () => {
  const { getOutDirPath } = await import('../../src/utils/file-system.js');
  assert.equal(getOutDirPath(), getOutDirPath());
});

test('createOutDir creates the directory', async () => {
  const { createOutDir, getOutDirPath } = await import('../../src/utils/file-system.js');
  const outDir = await createOutDir();
  assert.equal(outDir, getOutDirPath());
  const stats = await fs.stat(outDir);
  assert.ok(stats.isDirectory());
});

test('createOutDir is idempotent', async () => {
  const { createOutDir } = await import('../../src/utils/file-system.js');
  await createOutDir();
  await createOutDir();
  assert.ok(true);
});

test('safeWriteFile writes content inside sandbox', async () => {
  const { safeWriteFile, getOutDirPath } = await import('../../src/utils/file-system.js');
  const target = path.join(getOutDirPath(), 'hello.txt');
  await safeWriteFile(target, 'world');
  const content = await fs.readFile(target, 'utf-8');
  assert.equal(content, 'world');
});

test('safeWriteFile throws on path traversal via relative', async () => {
  const { safeWriteFile, getOutDirPath } = await import('../../src/utils/file-system.js');
  await assert.rejects(
    () => safeWriteFile(path.join(getOutDirPath(), '..', 'escape.txt'), 'x'),
    /SECURITY|sandbox|blocked/i
  );
});

test('safeWriteFile throws on absolute path outside sandbox', async () => {
  const { safeWriteFile } = await import('../../src/utils/file-system.js');
  await assert.rejects(
    () => safeWriteFile(path.join(tmpDir, 'outside.txt'), 'x'),
    /SECURITY|sandbox|blocked/i
  );
});

test('safeWriteFile creates nested subdirectories inside sandbox', async () => {
  const { safeWriteFile, getOutDirPath } = await import('../../src/utils/file-system.js');
  const nested = path.join(getOutDirPath(), 'a', 'b', 'c', 'deep.txt');
  await safeWriteFile(nested, 'nested');
  const stats = await fs.stat(nested);
  assert.ok(stats.isFile());
  assert.equal(await fs.readFile(nested, 'utf-8'), 'nested');
});

test('safeWriteFile writes empty string', async () => {
  const { safeWriteFile, getOutDirPath } = await import('../../src/utils/file-system.js');
  const target = path.join(getOutDirPath(), 'empty.txt');
  await safeWriteFile(target, '');
  assert.equal(await fs.readFile(target, 'utf-8'), '');
});

test('createOutDir returns the correct path', async () => {
  const { createOutDir, getOutDirPath } = await import('../../src/utils/file-system.js');
  assert.equal(await createOutDir(), getOutDirPath());
});
