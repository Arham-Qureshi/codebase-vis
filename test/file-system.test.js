import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir;
let origCwd;

before(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-context-test-'));
  process.chdir(tmpDir);
});

after(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('getOutDirPath returns path ending with codebase-out', async () => {
  const { getOutDirPath } = await import('../src/utils/file-system.js');
  const outPath = getOutDirPath();
  assert.ok(outPath.endsWith('codebase-out'));
  assert.ok(path.isAbsolute(outPath));
});

test('createOutDir creates codebase-out directory', async () => {
  const { createOutDir } = await import('../src/utils/file-system.js');
  const outDir = await createOutDir();
  const stats = await fs.stat(outDir);
  assert.ok(stats.isDirectory());
});

test('safeWriteFile writes inside sandbox', async () => {
  const { safeWriteFile, getOutDirPath } = await import('../src/utils/file-system.js');
  const outDir = await getOutDirPath();
  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, 'test.txt');
  await safeWriteFile(filePath, 'hello');
  const content = await fs.readFile(filePath, 'utf-8');
  assert.equal(content, 'hello');
});

test('safeWriteFile throws when writing outside sandbox', async () => {
  const { safeWriteFile } = await import('../src/utils/file-system.js');
  const outsidePath = path.join(tmpDir, 'escape.txt');
  await assert.rejects(
    () => safeWriteFile(outsidePath, 'data'),
    /SECURITY|sandbox|blocked/i
  );
});

test('safeWriteFile creates nested subdirectories inside sandbox', async () => {
  const { safeWriteFile, getOutDirPath } = await import('../src/utils/file-system.js');
  const outDir = getOutDirPath();
  await fs.mkdir(outDir, { recursive: true });
  const nestedPath = path.join(outDir, 'sub', 'nested', 'file.txt');
  await safeWriteFile(nestedPath, 'nested');
  const stats = await fs.stat(nestedPath);
  assert.ok(stats.isFile());
});
