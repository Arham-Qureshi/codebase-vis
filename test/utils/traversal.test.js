import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir;

async function createFixture() {
  const dirs = ['src', 'node_modules', 'dist', '.git', 'empty'];
  for (const d of dirs) {
    await fs.mkdir(path.join(tmpDir, d), { recursive: true });
  }
  await fs.writeFile(path.join(tmpDir, 'src', 'index.js'), 'const x = 1;');
  await fs.writeFile(path.join(tmpDir, 'src', 'util.ts'), 'export const y = 2;');
  await fs.writeFile(path.join(tmpDir, 'src', 'helper.py'), 'x = 1');
  await fs.writeFile(path.join(tmpDir, 'node_modules', 'lib.js'), 'module.exports = {}');
  await fs.writeFile(path.join(tmpDir, 'dist', 'bundle.js'), '// bundled');
  await fs.writeFile(path.join(tmpDir, '.git', 'config'), '[core]');
  await fs.writeFile(path.join(tmpDir, 'big.bin'), 'x'.repeat(4 * 1024 * 1024));
  try {
    await fs.symlink(path.join(tmpDir, 'src', 'index.js'), path.join(tmpDir, 'link.js'));
  } catch {}
}

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-trav-'));
  await createFixture();
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('discovers .js, .ts, .py files respecting ignore rules', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default().add(['.git', 'node_modules', 'dist']);
  const { files } = await discoverFiles(tmpDir, ignore);
  const basenames = files.map(f => path.basename(f)).sort();
  assert.ok(basenames.includes('index.js'));
  assert.ok(basenames.includes('util.ts'));
  assert.ok(basenames.includes('helper.py'));
  assert.equal(basenames.length, 3);
});

test('excludes ignored directories', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default().add(['.git', 'node_modules', 'dist']);
  const { files } = await discoverFiles(tmpDir, ignore);
  const basenames = files.map(f => path.basename(f));
  assert.ok(!basenames.includes('lib.js'), 'should exclude node_modules');
  assert.ok(!basenames.includes('bundle.js'), 'should exclude dist');
  assert.ok(!basenames.includes('config'), 'should exclude .git');
});

test('returns ignoredCount matching number of skipped entries', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default().add(['.git', 'node_modules', 'dist']);
  const { ignoredCount } = await discoverFiles(tmpDir, ignore);
  assert.ok(ignoredCount >= 3);
});

test('ignoredCount is 0 when nothing is ignored', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default();
  const { files, ignoredCount } = await discoverFiles(tmpDir, ignore);
  if (files.length > 0) {
    assert.equal(ignoredCount, 0);
  }
});

test('accepts custom ignore patterns', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default().add(['src']);
  const { files } = await discoverFiles(tmpDir, ignore);
  const basenames = files.map(f => path.basename(f));
  assert.ok(!basenames.includes('index.js'));
  assert.ok(!basenames.includes('util.ts'));
});

test('discovers nothing in empty directory', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default();
  const emptyDir = path.join(tmpDir, 'empty');
  await fs.mkdir(emptyDir).catch(() => {});
  const { files } = await discoverFiles(emptyDir, ignore);
  assert.equal(files.length, 0);
});

test('returns absolute paths only', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default().add(['.git', 'node_modules', 'dist']);
  const { files } = await discoverFiles(tmpDir, ignore);
  for (const f of files) {
    assert.ok(path.isAbsolute(f), `${f} is not absolute`);
  }
});

test('skips files larger than 2MB', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const ignore = (await import('ignore')).default();
  const { files } = await discoverFiles(tmpDir, ignore);
  const basenames = files.map(f => path.basename(f));
  assert.ok(!basenames.includes('big.bin'));
});

test('handles permission denied on a single entry without crashing', async () => {
  const { discoverFiles } = await import('../../src/utils/traversal.js');
  const locked = path.join(tmpDir, 'locked');
  await fs.mkdir(locked);
  await fs.writeFile(path.join(locked, 'ok.js'), 'ok');
  await fs.chmod(locked, 0o000);
  try {
    const ignore = (await import('ignore')).default();
    const { files } = await discoverFiles(tmpDir, ignore);
    assert.ok(Array.isArray(files));
  } finally {
    await fs.chmod(locked, 0o755);
    await fs.rm(locked, { recursive: true, force: true });
  }
});
