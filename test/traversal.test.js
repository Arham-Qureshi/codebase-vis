import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ignore from 'ignore';

let tmpDir;

async function createFixture() {
  const dirs = [
    'src',
    'node_modules',
    'dist',
    '.git',
  ];
  for (const d of dirs) {
    await fs.mkdir(path.join(tmpDir, d), { recursive: true });
  }

  await fs.writeFile(path.join(tmpDir, 'src', 'index.js'), 'const x = 1;');
  await fs.writeFile(path.join(tmpDir, 'src', 'util.ts'), 'export const y = 2;');
  await fs.writeFile(path.join(tmpDir, 'src', 'helper.py'), 'x = 1');
  await fs.writeFile(path.join(tmpDir, 'node_modules', 'lib.js'), 'module.exports = {}');
  await fs.writeFile(path.join(tmpDir, 'dist', 'bundle.js'), '// bundled');
  await fs.writeFile(path.join(tmpDir, '.git', 'config'), '[core]');
}

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-vis-traversal-'));
  await createFixture();
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('discovers .js, .ts, .py files', async () => {
  const { discoverFiles } = await import('../src/utils/traversal.js');
  const ig = (await import('ignore')).default().add(['.git', 'node_modules', 'dist']);
  const files = await discoverFiles(tmpDir, ig);
  const basenames = files.map(f => path.basename(f)).sort();
  assert.ok(basenames.includes('index.js'));
  assert.ok(basenames.includes('util.ts'));
  assert.ok(basenames.includes('helper.py'));
});

test('excludes node_modules and dist and .git directories', async () => {
  const { discoverFiles } = await import('../src/utils/traversal.js');
  const ig = (await import('ignore')).default().add(['.git', 'node_modules', 'dist']);
  const files = await discoverFiles(tmpDir, ig);
  const basenames = files.map(f => path.basename(f));
  assert.ok(!basenames.includes('lib.js'), 'should exclude node_modules');
  assert.ok(!basenames.includes('bundle.js'), 'should exclude dist');
  assert.ok(!basenames.includes('config'), 'should exclude .git');
});

test('accepts custom ignore patterns', async () => {
  const { discoverFiles } = await import('../src/utils/traversal.js');
  const ig = (await import('ignore')).default().add(['src']);
  const files = await discoverFiles(tmpDir, ig);
  const basenames = files.map(f => path.basename(f));
  assert.ok(!basenames.includes('index.js'));
  assert.ok(!basenames.includes('util.ts'));
});

test('discovers nothing in empty directory', async () => {
  const { discoverFiles } = await import('../src/utils/traversal.js');
  const ig = (await import('ignore')).default();
  const emptyDir = path.join(tmpDir, 'empty');
  await fs.mkdir(emptyDir);
  const files = await discoverFiles(emptyDir, ig);
  assert.equal(files.length, 0);
});
