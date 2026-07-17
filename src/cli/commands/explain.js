import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Graph from 'graphology';
import { loadGraph, toRelative } from '../shared.js';
import { getOutDirPath } from '../../utils/file-system.js';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.codebase-vis');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config.json');

const SYSTEM_PROMPT = `You are an expert software architect. Analyze the provided JSON payload, which represents a cluster of mathematically connected files extracted via AST (Abstract Syntax Tree). Your goal is to write a concise semantic summary of what this cluster does, and briefly explain the role of each file. Do NOT write code. Keep explanations brief, structural, and strictly based on the provided AST data.`;
const RETRY_STATE_FILENAME = '.explain-retry.json';

class TokenBucket {
  #tokens;
  #maxTokens;
  #refillInterval;
  #lastRefill;

  constructor(rpm) {
    this.#maxTokens = rpm;
    this.#tokens = rpm;
    this.#refillInterval = 60000 / rpm;
    this.#lastRefill = Date.now();
  }

  #refill() {
    const now = Date.now();
    const elapsed = now - this.#lastRefill;
    const newTokens = Math.floor(elapsed / this.#refillInterval);
    if (newTokens > 0) {
      this.#tokens = Math.min(this.#maxTokens, this.#tokens + newTokens);
      this.#lastRefill = now;
    }
  }

  async acquire() {
    while (true) {
      this.#refill();
      if (this.#tokens > 0) {
        this.#tokens--;
        return;
      }
      await new Promise(r => setTimeout(r, this.#refillInterval));
    }
  }
}

async function mapConcurrent(items, concurrency, fn, onProgress) {
  const results = [];
  let idx = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (err) {
        results[i] = { status: 'rejected', reason: err };
      }
      completed++;
      if (onProgress) onProgress(completed, items.length);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

async function readGlobalConfig() {
  try {
    const raw = await fs.readFile(GLOBAL_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeGlobalConfig(config) {
  await fs.mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
  await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

async function resolveCredentials(options = {}) {
  let config = await readGlobalConfig();

  if (options.reset) {
    p.log.info(pc.dim('Resetting saved credentials...'));
    config = {};
    await writeGlobalConfig(config);
  }

  if (options.model) {
    config.model = options.model;
    await writeGlobalConfig(config);
    p.log.info(pc.dim('Model overridden to ') + pc.cyan(options.model));
  }

  let apiKey = process.env.GROQ_API_KEY || config.apiKey;
  let model = config.model;

  if (apiKey && model) {
    p.log.info(pc.dim('Using saved credentials from ') + pc.cyan('~/.codebase-vis/config.json'));
    return { apiKey, model };
  }

  p.log.warn(pc.yellow('No API credentials found.'));

  if (!apiKey) {
    apiKey = await p.password({
      message: 'Paste your Groq API Key:',
      validate: (v) => {
        if (!v || v.trim().length === 0) return 'API key is required.';
      },
    });
    if (p.isCancel(apiKey)) return null;
  }

  if (!model) {
    model = await p.text({
      message: 'Enter the model name (e.g. llama-3.1-8b-instant):',
      placeholder: 'openai/gpt-oss-120b',
      defaultValue: 'openai/gpt-oss-120b',
      validate: (v) => {
        if (!v || v.trim().length === 0) return 'Model name is required.';
      },
    });
    if (p.isCancel(model)) return null;
  }

  config.apiKey = apiKey;
  config.model = model;
  await writeGlobalConfig(config);
  p.log.success(pc.green('Credentials saved to ') + pc.cyan('~/.codebase-vis/config.json'));

  return { apiKey, model };
}

function resolveConcurrency(raw) {
  const val = raw ? Number(raw) : 2;
  if (val > 5) {
    p.log.warn(pc.yellow(`--concurrency capped to 5 (requested: ${val}). Maximum allowed is 5.`));
    return 5;
  }
  return val;
}

function clusterGraph(graph) {
  // Communities are pre-calculated by the enricher during `generate`.
  // We just group file nodes by their existing community attribute.
  const clusters = new Map();

  graph.forEachNode((node, attrs) => {
    if (attrs.external) return;
    if (['entity', 'class', 'function', 'method'].includes(attrs.kind)) return;

    const communityId = attrs.community;
    if (!clusters.has(communityId)) {
      clusters.set(communityId, []);
    }
    clusters.get(communityId).push(node);
  });

  const batches = [];
  for (const [, nodes] of clusters) {
    for (let i = 0; i < nodes.length; i += 8) {
      batches.push(nodes.slice(i, i + 8));
    }
  }

  return batches;
}

function extractPayload(graph, batch) {
  return batch.map((nodeId) => {
    const attrs = graph.getNodeAttributes(nodeId);

    const astClasses = [];
    const astFunctions = [];
    graph.forEachOutNeighbor(nodeId, (neighbor, neighborAttrs) => {
      if (neighborAttrs.kind === 'class') {
        astClasses.push(neighborAttrs.label || neighbor);
      } else if (neighborAttrs.kind === 'function' || neighborAttrs.kind === 'entity') {
        astFunctions.push(neighborAttrs.label || neighbor);
      }
    });

    const graphEdgesTo = [];
    graph.forEachOutNeighbor(nodeId, (neighbor, neighborAttrs) => {
      if (!neighborAttrs.kind) {
        graphEdgesTo.push(toRelative(neighbor));
      }
    });

    const docstrings = attrs.docstrings || [];

    return {
      file: toRelative(nodeId),
      ast_classes: astClasses,
      ast_functions: astFunctions,
      ast_docstrings: docstrings,
      graph_edges_to: graphEdgesTo,
    };
  });
}

async function callLLM(apiKey, model, payload) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload, null, 2) },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (response.status === 429) {
    const err = new Error('Rate limited');
    err.status = 429;
    throw err;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callLLMWithRetry(apiKey, model, payload, bucket) {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await bucket.acquire();

    try {
      return await callLLM(apiKey, model, payload);
    } catch (err) {
      if (err.status !== 429 || attempt === maxAttempts - 1) throw err;

      const delay = Math.min(1000 * Math.pow(2, attempt), 32000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

export async function explainCommand(options) {
  p.intro(pc.bgCyan(pc.black(' codebase-vis explain ')));

  const retryPath = path.join(getOutDirPath(), RETRY_STATE_FILENAME);

  // --retry
  if (options.retry) {
    let retryData;
    try {
      retryData = JSON.parse(await fs.readFile(retryPath, 'utf-8'));
    } catch {
      p.log.error(pc.red('No failed clusters found to retry.'));
      p.outro(pc.dim('Nothing to retry.'));
      return;
    }
    if (!Array.isArray(retryData) || retryData.length === 0) {
      p.log.warn(pc.yellow('No failed clusters to retry.'));
      p.outro(pc.dim('Done.'));
      return;
    }

    const creds = await resolveCredentials(options);
    if (!creds) {
      p.cancel('Operation cancelled.');
      return;
    }

    const graph = await loadGraph();
    if (!graph) return;

    const mdPath = path.join(getOutDirPath(), 'semantic-summary.md');
    const graphPath = path.join(getOutDirPath(), 'graph.json');

    const s = p.spinner();
    s.start(`Retrying ${retryData.length} failed clusters...`);

    const concurrency = resolveConcurrency(options.concurrency);
    const rpm = options.rpm ? Number(options.rpm) : 30;
    const bucket = new TokenBucket(rpm);

    const completed = [];
    const stillFailed = [];
    const totalClusters = retryData[0].totalClusters;

    for (let i = 0; i < retryData.length; i++) {
      const fc = retryData[i];
      s.message(`Retrying cluster ${fc.index + 1} (${i + 1}/${retryData.length})...`);
      try {
        const summary = await callLLMWithRetry(creds.apiKey, creds.model, fc.payload, bucket);
        for (const nodeId of fc.batch) {
          graph.setNodeAttribute(nodeId, 'semantic_summary', summary);
        }
        completed.push({ ...fc, summary });
      } catch (err) {
        p.log.warn(pc.yellow(`Cluster ${fc.index + 1} still failed: ${err.message}`));
        stillFailed.push(fc);
      }
    }

    if (completed.length > 0) {
      let mdContent = `\n## Retried Clusters\n\n`;
      for (const fc of completed) {
        mdContent += `### Cluster ${fc.index + 1} of ${totalClusters}\n\n${fc.summary}\n\n---\n\n`;
      }
      await fs.appendFile(mdPath, mdContent, 'utf-8');
      s.stop(pc.green(`${completed.length}/${retryData.length} clusters retried successfully.`));
    } else {
      s.stop(pc.red('No clusters could be retried.'));
    }

    if (stillFailed.length > 0) {
      await fs.writeFile(retryPath, JSON.stringify(stillFailed, null, 2), 'utf-8');
      p.log.info(pc.dim('Run ') + pc.cyan('codebase-vis explain --retry') + pc.dim(' to retry remaining failed clusters.'));
    } else {
      await fs.rm(retryPath);
    }

    await fs.writeFile(graphPath, JSON.stringify(graph.export(), null, 2), 'utf-8');
    p.outro(pc.green('✔') + pc.dim(' Retry complete.'));
    return;
  }

  const creds = await resolveCredentials(options);
  if (!creds) {
    p.cancel('Operation cancelled.');
    return;
  }

  const s = p.spinner();
  s.start('Loading graph');
  const graph = await loadGraph();
  if (!graph) {
    s.stop(pc.red('Failed'));
    p.log.error(
      pc.red('graph.json not found. Run ') +
      pc.cyan('codebase-vis generate') +
      pc.red(' first.')
    );
    p.outro(pc.dim('Nothing to explain.'));
    return;
  }
  s.stop(pc.green(`Graph loaded: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  s.start('Running community detection');
  const batches = clusterGraph(graph);
  const totalFiles = batches.reduce((sum, b) => sum + b.length, 0);
  s.stop(pc.green(`Detected ${pc.bold(batches.length)} clusters across ${pc.bold(totalFiles)} files`));

  if (batches.length === 0) {
    p.log.warn(pc.yellow('No file nodes found to analyze.'));
    p.outro(pc.dim('Nothing to explain.'));
    return;
  }

  const concurrency = resolveConcurrency(options.concurrency);
  const rpm = options.rpm ? Number(options.rpm) : 30;
  const bucket = new TokenBucket(rpm);

  s.start(`Analyzing clusters... (0/${batches.length})`);

  const results = await mapConcurrent(batches, concurrency, async (batch, index) => {
    const payload = extractPayload(graph, batch);
    const summary = await callLLMWithRetry(creds.apiKey, creds.model, payload, bucket);
    return { batch, summary, index };
  }, (completed) => {
    s.message(`Analyzing clusters... (${completed}/${batches.length})`);
  });

  const graphPath = path.join(getOutDirPath(), 'graph.json');
  const mdPath = path.join(getOutDirPath(), 'semantic-summary.md');
  const mdSections = [];
  const failedClusters = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== 'fulfilled') {
      p.log.warn(pc.yellow(`Cluster ${i + 1} failed: ${result.reason.message}`));
      failedClusters.push({
        index: i,
        batch: batches[i],
        payload: extractPayload(graph, batches[i]),
        error: result.reason.message,
        totalClusters: batches.length,
      });
      continue;
    }
    const { batch, summary, index } = result.value;
    for (const nodeId of batch) {
      graph.setNodeAttribute(nodeId, 'semantic_summary', summary);
    }
    mdSections.push({ index, summary });
  }

  const exported = graph.export();
  await fs.writeFile(graphPath, JSON.stringify(exported, null, 2), 'utf-8');

  mdSections.sort((a, b) => a.index - b.index);
  const header = `# Semantic Codebase Summary\n\n_Generated by codebase-vis explain_\n\n---\n\n`;
  await fs.writeFile(mdPath, header, 'utf-8');
  for (const { index, summary } of mdSections) {
    const section = `## Cluster ${index + 1} of ${batches.length}\n\n${summary}\n\n---\n\n`;
    await fs.appendFile(mdPath, section, 'utf-8');
  }

  const failedCount = failedClusters.length;
  if (failedCount > 0) {
    await fs.writeFile(retryPath, JSON.stringify(failedClusters, null, 2), 'utf-8');
    s.stop(pc.yellow(`${batches.length - failedCount}/${batches.length} clusters analyzed (${failedCount} failed)`));
    p.log.info(pc.dim('Tip: Run ') + pc.cyan('codebase-vis explain --retry') + pc.dim(' to retry only the failed clusters.'));
  } else {
    s.stop(pc.green(`All ${batches.length} clusters analyzed.`));
  }

  const relMdPath = path.relative(process.cwd(), mdPath);
  p.log.success(
    pc.green('Semantic report written to ') + pc.cyan(relMdPath)
  );
  p.log.success(
    pc.green('graph.json enriched with ') + pc.cyan('semantic_summary') + pc.green(' attributes.')
  );

  p.log.message('');
  p.log.message(
    pc.dim('Tip: To switch models, run ') +
    pc.cyan('codebase-vis explain --model <name>') +
    pc.dim('\n     To reset credentials, run ') +
    pc.cyan('codebase-vis explain --reset')
  );

  p.outro(pc.green('✔') + pc.dim(' Explain complete.'));
}