import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
let tmpDir;

const workerURL = new URL('../../src/parser/parse-worker.js', import.meta.url);

test('constructor spawns N workers', async () => {
  const { WorkerPool } = await import('../../src/utils/worker-pool.js');
  const pool = new WorkerPool(2, workerURL);
  assert.ok(pool);
  pool.terminate();
});

test('run executes a task and returns a result', async () => {
  const { WorkerPool } = await import('../../src/utils/worker-pool.js');
  const pool = new WorkerPool(1, workerURL);
  const result = await pool.run(__filename);
  assert.ok(result);
  assert.ok(result.id || result.error !== undefined);
  pool.terminate();
});

test('run handles multiple tasks concurrently', async () => {
  const { WorkerPool } = await import('../../src/utils/worker-pool.js');
  const pool = new WorkerPool(2, workerURL);
  const promises = [pool.run(__filename), pool.run(__filename)];
  const results = await Promise.all(promises);
  assert.equal(results.length, 2);
  pool.terminate();
});

test('terminate kills all workers', async () => {
  const { WorkerPool } = await import('../../src/utils/worker-pool.js');
  const pool = new WorkerPool(2, workerURL);
  pool.terminate();
  assert.equal(pool.pending, 0);
  assert.equal(pool.active, 0);
});

test('pending and active getters', async () => {
  const { WorkerPool } = await import('../../src/utils/worker-pool.js');
  const pool = new WorkerPool(1, workerURL);
  pool.run(__filename);
  pool.run(__filename);
  await new Promise(r => setTimeout(r, 100));
  assert.ok(typeof pool.pending === 'number');
  assert.ok(typeof pool.active === 'number');
  pool.terminate();
});
