import Go from 'tree-sitter-go';
import Parser from 'tree-sitter';

export const grammar = Go;

const DEPENDENCY_QUERY = `
(import_spec path: (string_literal) @import_path)
`;

const ENTITY_QUERY = `
(type_declaration (type_spec name: (type_identifier) @class_name))
(function_declaration name: (identifier) @func_name)
(method_declaration name: (field_identifier) @method_name)
`;

export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);
    return captures.map(c => c.node.text.replace(/^"|"$/g, ''));
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
    const methods = captures.filter(c => c.name === 'method_name').map(c => c.node.text);
    return { classes, functions, methods, docstrings: [] };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
