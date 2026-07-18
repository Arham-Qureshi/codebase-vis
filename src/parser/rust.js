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

// extracts all top-level entity names
export function extractEntities(astRoot) {
  try {
    const query = new Parser.Query(grammar, ENTITY_QUERY);
    const captures = query.captures(astRoot);

    return captures.map(c => c.node.text);
  } catch {
    return [];
  }
}