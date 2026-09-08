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

// extracts all dependency paths
export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);

    return captures.map(c => c.node.text);
  } catch {
    return [];
  }
}

// extracts structured entities: { classes, functions, methods, docstrings }
export function extractEntities(astRoot) {
  try {
    const query = new Parser.Query(grammar, ENTITY_QUERY);
    const captures = query.captures(astRoot);
    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    const functions = captures.filter(c => c.name === 'func_name').map(c => c.node.text);
    const methods = captures.filter(c => c.name === 'impl_name').map(c => c.node.text);
    let docstrings = [];
    try {
      const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
      docstrings = docQuery.captures(astRoot).map(c=>c.node.text).filter(t=>t.startsWith('///') || t.startsWith('//!') || t.startsWith('/**') || t.startsWith('/*'));
    } catch {}
    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}