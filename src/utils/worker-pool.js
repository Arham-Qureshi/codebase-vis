import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export class WorkerPool {
  #workers = []; // All worker processes currently in the pool
  #free = []; // Workers that are currently idle and ready to accept tasks
  #queue = []; // Tasks waiting to be executed because all workers are busy
  #activeCount = 0; // Number of tasks currently being executed
  #workerPath; // Absolute path to the worker script
  #pending = new Map(); // Maps an active worker to its task's promise { resolve, reject }

  constructor(size, workerURL) {
    this.#workerPath = fileURLToPath(workerURL);
    // Initialize the pool with the specified number of workers
    for (let i = 0; i < size; i++) {
      this.#addWorker();
    }
  }

  #addWorker() {
    const worker = fork(this.#workerPath);
    this.#workers.push(worker);
    this.#free.push(worker);

    // Helper to handle worker crashes or unexpected exits
    const replace = () => {
      // If the worker was processing a task, reject its promise
      const pending = this.#pending.get(worker);
      if (pending) {
        this.#pending.delete(worker);
        this.#activeCount--;
        pending.reject(new Error('Worker process terminated unexpectedly'));
      }

      // Remove the crashed worker from our tracked lists
      const idx = this.#workers.indexOf(worker);
      if (idx === -1) return;
      this.#workers.splice(idx, 1);

      const freeIdx = this.#free.indexOf(worker);
      if (freeIdx !== -1) this.#free.splice(freeIdx, 1);

      this.#addWorker();
      this.#drain();
    };

    // Listen for unexpected exits or errors
    worker.on('exit', (code) => {
      if (code !== 0) replace();
    });
    worker.on('error', replace);
  }
  run(task) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ task, resolve, reject });
      this.#drain();
    });
  }

  // this assign works to worker until worker is free or task is completed
  #drain() {
    while (this.#free.length > 0 && this.#queue.length > 0) {
      const worker = this.#free.pop(); // Take an available worker
      const { task, resolve, reject } = this.#queue.shift(); // Take the next task
      this.#activeCount++;

      // Handler for the message returned by the worker process
      const onMessage = (result) => {
        this.#pending.delete(worker);
        worker.removeListener('message', onMessage);
        this.#activeCount--;
        this.#free.push(worker); // Worker is now free
        resolve(result);

        // See if there are more tasks waiting now that this worker is free
        this.#drain();
      };

      // Track the task's promise methods so we can reject them if the worker dies
      this.#pending.set(worker, { resolve, reject });
      worker.on('message', onMessage);

      // Send the task payload to the child process
      worker.send(task);
    }
  }

  // Getters for monitoring pool status
  get pending() { return this.#queue.length; }
  get active() { return this.#activeCount; }

  // terminate the workers
  async terminate() {
    for (const w of this.#workers) {
      w.kill('SIGTERM');
    }
    this.#workers = [];
    this.#free = [];
    this.#queue = [];
    this.#activeCount = 0;
    this.#pending.clear();
  }
}