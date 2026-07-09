import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { loadGraph, toRelative } from '../shared.js';
import { getOutDirPath } from '../../utils/file-system.js';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.agent-context');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config.json');

const SYSTEM_PROMPT = `You are an expert software architect. Analyze the provided JSON payload, which represents a cluster of mathematically connected files extracted via AST (Abstract Syntax Tree). Your goal is to write a concise semantic summary of what this cluster does, and briefly explain the role of each file. Do NOT write code. Keep explanations brief, structural, and strictly based on the provided AST data.`;

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

  // Handle --reset
  if (options.reset) {
    p.log.info(pc.dim('Resetting saved credentials...'));
    config = {};
    await writeGlobalConfig(config);
  }

  // Handle --model 
  if (options.model) {
    config.model = options.model;
    await writeGlobalConfig(config);
    p.log.info(pc.dim('Model overridden to ') + pc.cyan(options.model));
  }

  let apiKey = process.env.GROQ_API_KEY || config.apiKey;
  let model = config.model;

  if (apiKey && model) {
    p.log.info(pc.dim('Using saved credentials from ') + pc.cyan('~/.agent-context/config.json'));
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

  // Save for future runs
  config.apiKey = apiKey;
  config.model = model;
  await writeGlobalConfig(config);
  p.log.success(pc.green('Credentials saved to ') + pc.cyan('~/.agent-context/config.json'));

  return { apiKey, model };
}

function clusterGraph(graph) {
  // Clone the graph to avoid mutating the original enricher's community attributes.
  // Louvain.assign sets a `community` attribute — we need those for clustering but
  // want to preserve the original directory-based communities on the source graph.
  const workGraph = graph.copy();
  louvain.assign(workGraph);

  // Collect only file nodes (skip entities, externals)
  const clusters = new Map();

  workGraph.forEachNode((node, attrs) => {
    if (attrs.external || attrs.kind === 'entity') return;

    const communityId = attrs.community;
    if (!clusters.has(communityId)) {
      clusters.set(communityId, []);
    }
    clusters.get(communityId).push(node);
  });

  // Split large clusters into sub-batches of max 8 nodes
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

    // Separate classes from functions using their kind attribute
    const astClasses = [];
    const astFunctions = [];
    graph.forEachOutNeighbor(nodeId, (neighbor, neighborAttrs) => {
      if (neighborAttrs.kind === 'class') {
        astClasses.push(neighborAttrs.label || neighbor);
      } else if (neighborAttrs.kind === 'function' || neighborAttrs.kind === 'entity') {
        astFunctions.push(neighborAttrs.label || neighbor);
      }
    });

    // Collect import edges (file -> file)
    const graphEdgesTo = [];
    graph.forEachOutNeighbor(nodeId, (neighbor, neighborAttrs) => {
      if (!neighborAttrs.kind) {
        graphEdgesTo.push(toRelative(neighbor));
      }
    });

    // Pull docstrings from file-level attributes
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

async function appendMarkdown(summary, batchIndex, totalBatches) {
  const mdPath = path.join(getOutDirPath(), 'semantic-summary.md');

  // Write header on first batch
  if (batchIndex === 0) {
    const header = `# Semantic Codebase Summary\n\n_Generated by agent-context explain_\n\n---\n\n`;
    await fs.writeFile(mdPath, header, 'utf-8');
  }

  const section = `## Cluster ${batchIndex + 1} of ${totalBatches}\n\n${summary}\n\n---\n\n`;
  await fs.appendFile(mdPath, section, 'utf-8');
}

async function updateGraphJson(graph) {
  const graphPath = path.join(getOutDirPath(), 'graph.json');
  const exported = graph.export();
  await fs.writeFile(graphPath, JSON.stringify(exported, null, 2), 'utf-8');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function explainCommand(options) {
  p.intro(pc.bgCyan(pc.black(' agent-context explain ')));

  const creds = await resolveCredentials(options);
  if (!creds) {
    p.cancel('Operation cancelled.');
    return;
  }

  // Load graph
  const s = p.spinner();
  s.start('Loading graph');
  const graph = await loadGraph();
  if (!graph) {
    s.stop(pc.red('Failed'));
    p.log.error(
      pc.red('graph.json not found. Run ') +
      pc.cyan('agent-context generate') +
      pc.red(' first.')
    );
    p.outro(pc.dim('Nothing to explain.'));
    return;
  }
  s.stop(pc.green(`Graph loaded: ${pc.bold(graph.order)} nodes, ${pc.bold(graph.size)} edges`));

  // cluster with Louvain
  s.start('Running community detection');
  const batches = clusterGraph(graph);
  const totalFiles = batches.reduce((sum, b) => sum + b.length, 0);
  s.stop(pc.green(`Detected ${pc.bold(batches.length)} clusters across ${pc.bold(totalFiles)} files`));

  if (batches.length === 0) {
    p.log.warn(pc.yellow('No file nodes found to analyze.'));
    p.outro(pc.dim('Nothing to explain.'));
    return;
  }

  s.start(`Analyzing clusters... (0/${batches.length})`);
  let processed = 0;
  let filesProcessed = 0;

  let batchIndex = 0;
  while (batchIndex < batches.length) {
    const batch = batches[batchIndex];
    const payload = extractPayload(graph, batch);

    try {
      const summary = await callLLM(creds.apiKey, creds.model, payload);

      // Incremental disk writing
      for (const nodeId of batch) {
        graph.setNodeAttribute(nodeId, 'semantic_summary', summary);
      }

      // Overwrite graph.json with enriched data
      await updateGraphJson(graph);

      // Append to markdown report
      await appendMarkdown(summary, batchIndex, batches.length);

      processed++;
      filesProcessed += batch.length;
      s.message(`Analyzed ${filesProcessed}/${totalFiles} files (cluster ${processed}/${batches.length})`);

      batchIndex++;

      if (batchIndex < batches.length) {
        await delay(2500);
      }
    } catch (err) {
      if (err.status === 429) {
        s.message(pc.yellow('Rate limit reached. Cooling down for 10s...'));
        await delay(10000);
        // Do NOT increment batchIndex — retry this batch
        continue;
      }
      s.stop(pc.red('Error'));
      p.log.error(pc.red(err.message));
      p.log.message('');
      p.log.message(
        pc.dim('Tip: To change your model, run ') +
        pc.cyan('agent-context explain --model <name>') +
        pc.dim('\n     To reset all credentials, run ') +
        pc.cyan('agent-context explain --reset')
      );
      p.outro(pc.dim(`Partial results saved. ${processed} clusters completed.`));
      return;
    }
  }

  s.stop(pc.green(`All ${batches.length} clusters analyzed.`));

  const mdPath = path.relative(process.cwd(), path.join(getOutDirPath(), 'semantic-summary.md'));
  p.log.success(
    pc.green('Semantic report written to ') + pc.cyan(mdPath)
  );
  p.log.success(
    pc.green('graph.json enriched with ') + pc.cyan('semantic_summary') + pc.green(' attributes.')
  );

  p.log.message('');
  p.log.message(
    pc.dim('Tip: To switch models, run ') +
    pc.cyan('agent-context explain --model <name>') +
    pc.dim('\n     To reset credentials, run ') +
    pc.cyan('agent-context explain --reset')
  );

  p.outro(pc.green('✔') + pc.dim(' Explain complete.'));
}