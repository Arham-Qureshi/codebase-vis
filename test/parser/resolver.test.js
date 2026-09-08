import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function importResolver() { return import('../../src/parser/resolver.js'); }

test('resolveJsImport resolves .js→.ts convention', async () => {
  const { resolveJsImport, clearResolverCache } = await importResolver();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'res-'));
  try {
    await fs.writeFile(path.join(tmp, 'foo.ts'), 'export const x=1');
    const spec = './foo.js';
    const resolved = resolveJsImport(spec, tmp);
    assert.match(resolved, /foo\.ts/);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); clearResolverCache(); }
});

test('resolveJsImport resolves bare directory index', async () => {
  const { resolveJsImport, clearResolverCache } = await importResolver();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'res-'));
  try {
    await fs.mkdir(path.join(tmp,'utils'));
    await fs.writeFile(path.join(tmp,'utils','index.ts'), 'export {}');
    const r = resolveJsImport('./utils', tmp);
    assert.match(r, /index\.ts/);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); clearResolverCache(); }
});

test('resolveJsImport aliases @/ → src via tsconfig paths', async () => {
  const { resolveJsImport, clearResolverCache } = await importResolver();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'res-'));
  try {
    await fs.mkdir(path.join(tmp,'src'));
    await fs.writeFile(path.join(tmp,'src','helpers.ts'), 'export {}');
    await fs.writeFile(path.join(tmp,'tsconfig.json'), JSON.stringify({compilerOptions:{paths:{"@/*":["src/*"]}}}));
    const r = resolveJsImport('@/helpers', tmp);
    assert.match(r, /src\/helpers/);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); clearResolverCache(); }
});

test('loadTsconfigAliases skips @ extends', async () => {
  const { loadTsconfigAliases, clearResolverCache } = await importResolver();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'res-'));
  try {
    await fs.writeFile(path.join(tmp,'tsconfig.json'), JSON.stringify({extends:"@tsconfig/svelte/tsconfig.json", compilerOptions:{paths:{"@/*":["src/*"]}}}));
    const aliases = loadTsconfigAliases(tmp);
    assert.ok(aliases['@/']);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); clearResolverCache(); }
});
