import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'tree-sitter';
import { grammar as jsGrammar, extractDependencies as jsExtractDeps, extractEntities as jsExtractEnts } from './javascript.js';
import { grammar as tsGrammar, tsxGrammar, extractDependencies as tsExtractDeps, extractEntities as tsExtractEnts } from './typescript.js';

// maps extensions to their grammar and extraction functions
const GRAMMAR_MAP = {
  '.js':  { grammar: jsGrammar,  extractDeps: jsExtractDeps, extractEnts: jsExtractEnts },
  '.jsx': { grammar: jsGrammar,  extractDeps: jsExtractDeps, extractEnts: jsExtractEnts },
  '.ts':  { grammar: tsGrammar,  extractDeps: tsExtractDeps, extractEnts: tsExtractEnts },
  '.tsx': { grammar: tsxGrammar, extractDeps: tsExtractDeps, extractEnts: tsExtractEnts },
};

// reads a file, parses its AST, and returns a normalized object
export async function parseFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');

    // skip empty files
    if (!content || content.trim().length === 0) return null;

    const ext = path.extname(filePath).toLowerCase();
    const config = GRAMMAR_MAP[ext];

    if (!config) return null;

    const parser = new Parser();
    parser.setLanguage(config.grammar);

    const tree = parser.parse(content);
    const rootNode = tree.rootNode;

    const dependencies = config.extractDeps(rootNode, config.grammar);
    const entities = config.extractEnts(rootNode, config.grammar);

    return {
      id: filePath,
      dependencies,
      entities,
    };
  } catch {
    // return null gracefully
    return null;
  }
}
