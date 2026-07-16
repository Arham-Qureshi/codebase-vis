import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'tree-sitter';
import { grammar as jsGrammar, extractDependencies as jsExtractDeps, extractEntities as jsExtractEnts } from './javascript.js';
import { grammar as tsGrammar, tsxGrammar, extractDependencies as tsExtractDeps, extractEntities as tsExtractEnts } from './typescript.js';
import { grammar as pyGrammar, extractDependencies as pyExtractDeps, extractEntities as pyExtractEnts } from './python.js';
import { grammar as cppGrammar, extractDependencies as cppExtractDeps, extractEntities as cppExtractEnts } from './cpp.js';
import { grammar as htmlGrammar, extractDependencies as htmlExtractDeps, extractEntities as htmlExtractEnts } from './html.js';
import { grammar as cssGrammar, extractDependencies as cssExtractDeps, extractEntities as cssExtractEnts } from './css.js';
import { grammar as rustGrammar, extractDependencies as rustExtractDeps, extractEntities as rustExtractEnts } from './rust.js';
import { grammar as goGrammar, extractDependencies as goExtractDeps, extractEntities as goExtractEnts } from './go.js';
import { grammar as javaGrammar, extractDependencies as javaExtractDeps, extractEntities as javaExtractEnts } from './java.js';

// maps extensions to their grammar and extraction functions
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