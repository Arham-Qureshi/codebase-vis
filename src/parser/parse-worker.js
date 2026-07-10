import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'tree-sitter';
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

async function parseFile(filePath) {
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
  return { id: filePath, dependencies: dependencies || [], entities: entities || [] };
}

process.on('message', async (msg) => {
  try {
    const result = await parseFile(msg);
    process.send(result || { id: msg, error: true });
  } catch {
    process.send({ id: msg, error: true });
  }
});