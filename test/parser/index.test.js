import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-pidx-'));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createFile(name, content) {
  const fp = path.join(tmpDir, name);
  await fs.writeFile(fp, content, 'utf-8');
  return fp;
}

test('parseFile parses a JS file correctly', async () => {
  const { parseFile } = await import('../../src/parser/index.js');
  const fp = await createFile('test.js', "import x from 'y';\nclass Foo {}");
  const result = await parseFile(fp);
  assert.ok(result);
  assert.equal(result.id, fp);
  assert.ok(result.dependencies.includes('y'));
  assert.ok(result.entities.classes.includes('Foo'));
});

test('parseFile returns null for empty file', async () => {
  const { parseFile } = await import('../../src/parser/index.js');
  const fp = await createFile('empty.js', '');
  const result = await parseFile(fp);
  assert.equal(result, null);
});

test('parseFile returns null for whitespace-only file', async () => {
  const { parseFile } = await import('../../src/parser/index.js');
  const fp = await createFile('blank.js', '   \n\n  ');
  const result = await parseFile(fp);
  assert.equal(result, null);
});

test('parseFile returns null for unknown extension', async () => {
  const { parseFile } = await import('../../src/parser/index.js');
  const fp = await createFile('file.xyz', 'content');
  const result = await parseFile(fp);
  assert.equal(result, null);
});

test('parseFile returns null for non-existent file', async () => {
  const { parseFile } = await import('../../src/parser/index.js');
  const result = await parseFile('/nonexistent/file.js');
  assert.equal(result, null);
});

test('parseFileBatch processes multiple files', async () => {
  const { parseFileBatch } = await import('../../src/parser/index.js');
  const f1 = await createFile('a.js', "import b from './b';");
  const f2 = await createFile('b.js', 'export const x = 1;');
  const results = await parseFileBatch([f1, f2]);
  assert.equal(results.length, 2);
  assert.ok(results[0]);
  assert.ok(results[1]);
});

test('parseFileBatch preserves input order', async () => {
  const { parseFileBatch } = await import('../../src/parser/index.js');
  const f1 = await createFile('first.js', 'const x = 1;');
  const f2 = await createFile('second.js', 'const y = 2;');
  const f3 = await createFile('third.js', 'const z = 3;');
  const results = await parseFileBatch([f1, f2, f3]);
  assert.equal(results[0].id, f1);
  assert.equal(results[1].id, f2);
  assert.equal(results[2].id, f3);
});

test('parseFileBatch handles partial failures', async () => {
  const { parseFileBatch } = await import('../../src/parser/index.js');
  const f1 = await createFile('good.js', 'const x = 1;');
  const results = await parseFileBatch([f1, '/nonexistent.js', f1]);
  assert.equal(results.length, 3);
  assert.ok(results[0] && !results[0].error);
  assert.ok(results[1] === undefined || results[1]?.error === true);
  assert.ok(results[2] && !results[2].error);
});

test('parseFileBatch reports progress', async () => {
  const { parseFileBatch } = await import('../../src/parser/index.js');
  const f1 = await createFile('p1.js', 'const x = 1;');
  const f2 = await createFile('p2.js', 'const y = 2;');
  let progressCalls = 0;
  await parseFileBatch([f1, f2], (done, total) => { progressCalls++; });
  assert.ok(progressCalls > 0);
});

test('parseFileBatch rejects with null jobs', async () => {
  const { parseFileBatch } = await import('../../src/parser/index.js');
  const f1 = await createFile('j1.js', 'const x = 1;');
  const results = await parseFileBatch([f1], () => {}, null);
  assert.equal(results.length, 1);
  assert.ok(results[0]);
});

test('parseFileBatch with empty array returns empty', async () => {
  const { parseFileBatch } = await import('../../src/parser/index.js');
  const results = await parseFileBatch([]);
  assert.deepEqual(results, []);
});
