import Rust from 'tree-sitter-rust';
import Parser from 'tree-sitter';

export const grammar = Rust;

const DEPENDENCY_QUERY = `
(use_declaration argument: (_) @import_path)
(extern_crate_declaration name: (identifier) @import_path)
`;

const ENTITY_QUERY = `
(struct_item name: (type_identifier) @class_name)
(enum_item name: (type_identifier) @class_name)
(trait_item name: (type_identifier) @class_name)
(function_item name: (identifier) @func_name)
`;

const METHOD_QUERY = `
(impl_item
  (declaration_list
    (function_item name: (identifier) @method_name)))
`;

const DOCSTRING_QUERY = `
(line_comment) @doc
(block_comment) @doc
`;

export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);
    return captures.map(c => c.node.text);
  } catch {
    return [];
  }
}

export function extractEntities(astRoot) {
  try {
    const query = new Parser.Query(grammar, ENTITY_QUERY);
    const captures = query.captures(astRoot);
    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    const functions = captures.filter(c => c.name === 'func_name').map(c => c.node.text);

    const methodQuery = new Parser.Query(grammar, METHOD_QUERY);
    const methodCaptures = methodQuery.captures(astRoot);
    const methods = methodCaptures.map(c => c.node.text);

    const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
    const docstrings = docQuery.captures(astRoot)
      .map(c => c.node.text)
      .filter(t => t.startsWith('///') || t.startsWith('//!') || t.startsWith('/**') || t.startsWith('/*!'));

    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
