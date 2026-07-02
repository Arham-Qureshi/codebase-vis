import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'tree-sitter';
import { grammar as jsGrammar } from './javascript.js';
import { grammar as tsGrammar, tsxGrammar } from './typescript.js';

const GRAMMAR_MAP = {
  '.js': jsGrammar,
  '.jsx': jsGrammar,
  '.ts': tsGrammar,
  '.tsx': tsxGrammar,
};

// reads a file and parses it into a tree-sitter AST
export async function parseFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');

    // skip empty files
    if (!content || content.trim().length === 0) return null;

    const ext = path.extname(filePath).toLowerCase();
    const grammar = GRAMMAR_MAP[ext];

    if (!grammar) return null;

    const parser = new Parser();
    parser.setLanguage(grammar);

    const tree = parser.parse(content);
    return tree.rootNode;
  } catch {
    // return null gracefully
    return null;
  }
}
