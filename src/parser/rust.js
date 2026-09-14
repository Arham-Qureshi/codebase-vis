import Rust from 'tree-sitter-rust';
import Parser from 'tree-sitter';

// language grammar for .rs files
export const grammar = Rust;

// capturing use and extern crate paths
const DEPENDENCY_QUERY = `
(use_declaration argument: (_) @import_path)
(extern_crate_declaration name: (identifier) @import_path)
`;

// capturing structs, enums, traits, functions, and impl blocks
const ENTITY_QUERY = `
(struct_item name: (type_identifier) @class_name)
(enum_item name: (type_identifier) @class_name)
(trait_item name: (type_identifier) @class_name)
(function_item name: (identifier) @func_name)
(impl_item type: (type_identifier) @impl_name)
`;

const DOCSTRING_QUERY = `
(line_comment) @doc
(block_comment) @doc
`;

const queryCache = new Map();

function getQueries(g) {
  if (!queryCache.has(g)) {
    queryCache.set(g, {
      deps: new Parser.Query(g, DEPENDENCY_QUERY),
      entities: new Parser.Query(g, ENTITY_QUERY),
      docstrings: new Parser.Query(g, DOCSTRING_QUERY),
    });
  }
  return queryCache.get(g);
}

// extracts all dependency paths
export function extractDependencies(astRoot) {
  try {
    const { deps } = getQueries(grammar);
    const captures = deps.captures(astRoot);
    return captures.map(c => c.node.text);
  } catch {
    return [];
  }
}

// extracts structured entities: { classes, functions, methods, docstrings }
export function extractEntities(astRoot) {
  try {
    const { entities, docstrings: docQuery } = getQueries(grammar);
    const captures = entities.captures(astRoot);
    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    const functions = captures.filter(c => c.name === 'func_name').map(c => c.node.text);
    const methods = captures.filter(c => c.name === 'impl_name').map(c => c.node.text);
    let docstrings = [];
    try {
      docstrings = docQuery.captures(astRoot).map(c=>c.node.text).filter(t=>t.startsWith('///') || t.startsWith('//!') || t.startsWith('/**') || t.startsWith('/*'));
    } catch {}
    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}