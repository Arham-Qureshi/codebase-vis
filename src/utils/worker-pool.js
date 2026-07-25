import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

export class WorkerPool {
  #workers = [];
  #free = [];
  #queue = [];
  #activeCount = 0;
  #workerPath;
  #pending = new Map();
  #timeoutIds = new Map();
  #crashCount = 0;
  #lastCrashTime = 0;
  #maxCrashWindow = 10000;
  #maxQueueSize = 10000;
  #taskTimeout = 30000;
  #timeoutKilled = new Set();

  constructor(size, workerURL) {
    this.#workerPath = fileURLToPath(workerURL);
    logger.info('Pool', `Creating pool with ${size} workers, maxQueue=${this.#maxQueueSize}, timeout=${this.#taskTimeout}ms`);
    for (let i = 0; i < size; i++) {
      this.#addWorker();
    }
    logger.info('Pool', `Pool initialized — ${this.#workers.length} workers ready`);
  }

  #addWorker() {
    const worker = fork(this.#workerPath);
    this.#workers.push(worker);
    this.#free.push(worker);
    logger.debug('Pool', `Worker spawned — pid=${worker.pid}, poolSize=${this.#workers.length}`);

    const replace = () => {
      logger.debug('Pool', `Worker exit/error — pid=${worker.pid}, timeoutKilled=${this.#timeoutKilled.has(worker)}`);

      clearTimeout(this.#timeoutIds.get(worker));
      this.#timeoutIds.delete(worker);

      const pending = this.#pending.get(worker);
      if (pending) {
        this.#pending.delete(worker);
        this.#activeCount--;
        pending.reject(new Error('Worker process terminated unexpectedly'));
        logger.warn('Pool', `Task rejected due to worker death — pid=${worker.pid}`);
      }

      const idx = this.#workers.indexOf(worker);
      if (idx === -1) return;
      this.#workers.splice(idx, 1);

      const freeIdx = this.#free.indexOf(worker);
      if (freeIdx !== -1) this.#free.splice(freeIdx, 1);

      if (this.#timeoutKilled.has(worker)) {
        this.#timeoutKilled.delete(worker);
        logger.info('Pool', `Replacing worker killed by timeout — pid=${worker.pid}`);
        this.#addWorker();
        this.#drain();
        return;
      }

      const now = Date.now();
      if (now - this.#lastCrashTime > this.#maxCrashWindow) {
        this.#crashCount = 0;
        logger.debug('Pool', 'Crash window reset (10s elapsed without crash)');
      }
      this.#lastCrashTime = now;
      this.#crashCount++;
      logger.warn('Pool', `Worker crashed — pid=${worker.pid}, crashCount=${this.#crashCount}/${3}, activeCount=${this.#activeCount}, queueLength=${this.#queue.length}`);
      if (this.#crashCount > 3) {
        logger.error('Pool', `Too many crashes (${this.#crashCount}) — stopping replacements`);
        return;
      }

      this.#addWorker();
      this.#drain();
    };

    worker.on('exit', (code) => {
      logger.debug('Pool', `Worker exit event — pid=${worker.pid}, code=${code}`);
      if (code !== 0) replace();
    });
    worker.on('error', (err) => {
      logger.error('Pool', `Worker error event — pid=${worker.pid}`);
      replace();
    });
  }

  run(task) {
    if (this.#queue.length >= this.#maxQueueSize) {
      logger.warn('Pool', `Queue full (${this.#queue.length}) — rejecting task: ${path.relative(process.cwd(), task)}`);
      return Promise.reject(new Error('Task queue full. Try increasing --jobs or reducing files.'));
    }
    logger.debug('Pool', `Task enqueued — queueLength=${this.#queue.length + 1}, activeCount=${this.#activeCount}, task=${path.relative(process.cwd(), task)}`);
    return new Promise((resolve, reject) => {
      this.#queue.push({ task, resolve, reject });
      this.#drain();
    });
  }

  #drain() {
    while (this.#free.length > 0 && this.#queue.length > 0) {
      const worker = this.#free.pop();
      const { task, resolve, reject } = this.#queue.shift();
      this.#activeCount++;
      logger.debug('Pool', `Task assigned — pid=${worker.pid}, task=${path.relative(process.cwd(), task)}, activeCount=${this.#activeCount}, queueRemaining=${this.#queue.length}`);

      const timeout = setTimeout(() => {
        this.#timeoutIds.delete(worker);
        this.#timeoutKilled.add(worker);
        worker.kill('SIGKILL');
        this.#pending.delete(worker);
        this.#activeCount--;
        logger.warn('Pool', `Task timed out — pid=${worker.pid}, task=${path.relative(process.cwd(), task)}, timeout=${this.#taskTimeout}ms`);
        reject(new Error(`Task timed out after ${this.#taskTimeout}ms`));
        this.#drain();
      }, this.#taskTimeout);
      this.#timeoutIds.set(worker, timeout);

      const onMessage = (result) => {
        clearTimeout(this.#timeoutIds.get(worker));
        this.#timeoutIds.delete(worker);
        this.#pending.delete(worker);
        worker.removeListener('message', onMessage);
        this.#activeCount--;
        this.#free.push(worker);
        logger.debug('Pool', `Task completed — pid=${worker.pid}, task=${path.relative(process.cwd(), task)}, activeCount=${this.#activeCount}`);
        resolve(result);

        this.#drain();
      };

      this.#pending.set(worker, { resolve, reject });
      worker.on('message', onMessage);

      worker.send(task);
    }
  }

  get pending() { return this.#queue.length; }
  get active() { return this.#activeCount; }

  async terminate() {
    const timeoutCount = this.#timeoutIds.size;
    for (const timeout of this.#timeoutIds.values()) {
      clearTimeout(timeout);
    }
    this.#timeoutIds.clear();
    const workerCount = this.#workers.length;
    for (const w of this.#workers) {
      w.kill('SIGTERM');
    }
    this.#workers = [];
    this.#free = [];
    this.#queue = [];
    this.#activeCount = 0;
    this.#pending.clear();
    logger.info('Pool', `Terminated — ${workerCount} workers killed, ${timeoutCount} timeouts cleared`);
  }
}
