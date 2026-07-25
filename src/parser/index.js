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
import { grammar as rustGrammar, extractDependencies as rustExtractDeps, extractEntities as rustExtractEnts } from './rust.js';
import { grammar as goGrammar, extractDependencies as goExtractDeps, extractEntities as goExtractEnts } from './go.js';
import { grammar as javaGrammar, extractDependencies as javaExtractDeps, extractEntities as javaExtractEnts } from './java.js';

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
  '.rs': { grammar: rustGrammar, extractDeps: rustExtractDeps, extractEnts: rustExtractEnts },
  '.go': { grammar: goGrammar, extractDeps: goExtractDeps, extractEnts: goExtractEnts },
  '.java': { grammar: javaGrammar, extractDeps: javaExtractDeps, extractEnts: javaExtractEnts },
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
  const relPath = path.relative(process.cwd(), filePath);
  return { id: relPath, dependencies, entities };
}

export async function parseFile(filePath) {
  try {
    return await parseFileInternal(filePath);
  } catch {
    return null;
  }
}

export async function parseFileBatch(files, onProgress, jobs) {
  const cpuCores = os.cpus().length;
  const maxWorkers = Math.max(cpuCores, 4);
  const requested = jobs ?? Math.max(1, cpuCores - 1);
  const numWorkers = Math.min(requested, maxWorkers);
  if (requested !== numWorkers) {
    console.warn(`[WARN] --jobs capped to ${numWorkers} (requested: ${requested}). Maximum recommended is ${maxWorkers}.`);
  }

  const workerURL = new URL('./parse-worker.js', import.meta.url);

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
        results[i] = { id: path.relative(process.cwd(), file), error: true };
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