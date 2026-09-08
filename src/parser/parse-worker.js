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
import { extractDependencies as mdExtractDeps, extractEntities as mdExtractEnts } from './markdown.js';
import { extractDependencies as jsonExtractDeps, extractEntities as jsonExtractEnts } from './json.js';
import { extractDependencies as imgExtractDeps, extractEntities as imgExtractEnts } from './image.js';

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
  '.md': { grammar: null, extractDeps: mdExtractDeps, extractEnts: mdExtractEnts },
  '.mdx': { grammar: null, extractDeps: mdExtractDeps, extractEnts: mdExtractEnts },
  '.json': { grammar: null, extractDeps: jsonExtractDeps, extractEnts: jsonExtractEnts },
  '.png': { grammar: null, extractDeps: imgExtractDeps, extractEnts: imgExtractEnts },
  '.jpg': { grammar: null, extractDeps: imgExtractDeps, extractEnts: imgExtractEnts },
  '.jpeg': { grammar: null, extractDeps: imgExtractDeps, extractEnts: imgExtractEnts },
  '.gif': { grammar: null, extractDeps: imgExtractDeps, extractEnts: imgExtractEnts },
  '.svg': { grammar: null, extractDeps: imgExtractDeps, extractEnts: imgExtractEnts },
  '.ico': { grammar: null, extractDeps: imgExtractDeps, extractEnts: imgExtractEnts },
  '.webp': { grammar: null, extractDeps: imgExtractDeps, extractEnts: imgExtractEnts },
};

const parserCache = new Map();

function getParser(ext) {
  const config = GRAMMAR_MAP[ext];
  if (!config) return null;
  if (config.grammar === null) return { parser: null, config };
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
  let dependencies;
  let entities;
  if (config.grammar === null) {
    const fakeRoot = { text: content };
    dependencies = config.extractDeps(fakeRoot, config.grammar);
    entities = config.extractEnts(fakeRoot, config.grammar);
  } else {
    const tree = parser.parse(content);
    const rootNode = tree.rootNode;
    dependencies = config.extractDeps(rootNode, config.grammar);
    entities = config.extractEnts(rootNode, config.grammar);
  }
  const relPath = path.relative(process.cwd(), filePath);
  return { id: relPath, dependencies: dependencies || [], entities: entities || [] };
}

process.on('message', async (msg) => {
  try {
    const result = await parseFile(msg);
    const id = result ? result.id : path.relative(process.cwd(), msg);
    process.send(result || { id, error: true });
  } catch {
    process.send({ id: path.relative(process.cwd(), msg), error: true });
  }
});