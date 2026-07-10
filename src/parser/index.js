import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Parser from 'tree-sitter';
import { WorkerPool } from '../utils/worker-pool.js';
import { grammar as jsGrammar, extractDependencies as jsExtractDeps, extractEntities as jsExtractEnts } from './javascript.js';
import { grammar as tsGrammar, tsxGrammar, extractDependencies as tsExtractDeps, extractEntities as tsExtractEnts } from './typescript.js';
import { grammar as pyGrammar, extractDependencies as pyExtractDeps, extractEntities as pyExtractEnts } from './python.js';
import { grammar as cppGrammar, extractDependencies as cppExtractDeps, extractEntities as cppExtractEnts } from './cpp.js';
import { grammar as htmlGrammar, extractDependencies as htmlExtractDeps, extractEntities as htmlExtractEnts } from './html.js';
import { grammar as cssGrammar, extractDependencies as cssExtractDeps, extractEntities as cssExtractEnts } from './css.js';

const GRAMMAR_MAP = {
  '.js': { grammar: jsGrammar, extractDeps: jsExtractDeps, extractEnts: jsExtractEnts },
  '.jsx': { grammar: jsGrammar, extractDeps: jsExtractDeps, extractEnts: jsExtractEnts },
  '.ts': { grammar: tsGrammar, extractDeps: tsExtractDeps, extractEnts: tsExtractEnts },
  '.tsx': { grammar: tsxGrammar, extractDeps: tsExtractDeps, extractEnts: tsExtractEnts },
  '.py': { grammar: pyGrammar, extractDeps: pyExtractDeps, extractEnts: pyExtractEnts },
  '.cpp': { grammar: cppGrammar, extractDeps: cppExtractDeps, extractEnts: cppExtractEnts },
  '.h': { grammar: cppGrammar, extractDeps: cppExtractDeps, extractEnts: cppExtractEnts },
  '.hpp': { grammar: cppGrammar, extractDeps: cppExtractDeps, extractEnts: cppExtractEnts },
  '.html': { grammar: htmlGrammar, extractDeps: htmlExtractDeps, extractEnts: htmlExtractEnts },
  '.css': { grammar: cssGrammar, extractDeps: cssExtractDeps, extractEnts: cssExtractEnts },
};

const parserCache = new Map();
const BATCH_SIZE = 100;

function getParser(ext) {
  const config = GRAMMAR_MAP[ext];
  if (!config) return null;
  if (!parserCache.has(ext)) {
    const parser = new Parser();
    parser.setLanguage(config.grammar);
    parserCache.set(ext, parser);
  }
  return { parser: parserCache.get(ext), config };
}

async function parseFileInternal(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  if (!content || content.trim().length === 0) return null;
  const ext = path.extname(filePath).toLowerCase();
  const entry = getParser(ext);
  if (!entry) return null;
  const { parser, config } = entry;
  const tree = parser.parse(content);
  const rootNode = tree.rootNode;
  const dependencies = config.extractDeps(rootNode, config.grammar);
  const entities = config.extractEnts(rootNode, config.grammar);
  return { id: filePath, dependencies, entities };
}

export async function parseFile(filePath) {
  try {
    return await parseFileInternal(filePath);
  } catch {
    return null;
  }
}

export async function parseFileBatch(files, onProgress, jobs) {
  // Determine number of workers: either user-specified or (CPU cores - 1), minimum 1
  const numWorkers = jobs ?? Math.max(1, os.cpus().length - 1);

  // Resolve the absolute path to the worker script
  const workerURL = new URL('./parse-worker.js', import.meta.url);

  // Initialize the pool which spawns the child processes
  const pool = new WorkerPool(numWorkers, workerURL);

  // Pre-allocate the results array to preserve the original order of files
  const results = new Array(files.length);
  let completed = 0;

  // Map each file to a promise representing its parsing task in the worker pool
  const promises = files.map((file, i) =>
    pool.run(file)
      .then((result) => {
        // On success, store the result at the same index
        results[i] = result;
      })
      .catch(() => {
        // On failure, store a fallback error object
        results[i] = { id: file, error: true };
      })
      .then(() => {
        // Regardless of success/failure, update progress
        completed++;
        // Throttle progress updates to avoid console spam
        if (onProgress && completed % BATCH_SIZE === 0) {
          onProgress(completed, files.length);
        }
      })
  );

  // Wait for all parsing tasks to finish (whether they resolved or rejected)
  await Promise.allSettled(promises);

  // Clean up worker processes to prevent hanging
  await pool.terminate();

  // Send a final progress update to indicate 100% completion
  if (onProgress) onProgress(files.length, files.length);

  return results;
}