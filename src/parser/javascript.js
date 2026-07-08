import JavaScript from 'tree-sitter-javascript';
import Parser from 'tree-sitter';

// language grammar for .js and .jsx files
export const grammar = JavaScript;

// capturing import/require/dynamic-import paths
const DEPENDENCY_QUERY = `
(import_statement source: (string (string_fragment) @import_path))
(call_expression
  function: (identifier) @_func_name
  arguments: (arguments (string (string_fragment) @require_path))
  (#eq? @_func_name "require"))
(call_expression
  function: (import)
  arguments: (arguments (string (string_fragment) @dyn_import_path)))
`;

// capturing classes, functions, and arrow fns
const ENTITY_QUERY = `
(class_declaration name: (identifier) @class_name)
(function_declaration name: (identifier) @func_name)
(lexical_declaration
  (variable_declarator
    name: (identifier) @arrow_name
    value: [(arrow_function) (function_expression)]))
`;

// capturing JSDoc-style block comments (/** ... */)
const DOCSTRING_QUERY = `
(comment) @doc
`;

// extracts all dependency paths
export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);

    return captures
      .filter(c => c.name !== '_func_name')
      .map(c => c.node.text);
  } catch {
    return [];
  }
}

// extracts structured entities: { classes, functions, docstrings }
export function extractEntities(astRoot) {
  try {
    const query = new Parser.Query(grammar, ENTITY_QUERY);
    const captures = query.captures(astRoot);

    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    const functions = captures
      .filter(c => c.name === 'func_name' || c.name === 'arrow_name')
      .map(c => c.node.text);

    const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
    const docCaptures = docQuery.captures(astRoot);
    const docstrings = docCaptures
      .map(c => c.node.text)
      .filter(t => t.startsWith('/**'));

    return { classes, functions, docstrings };
  } catch {
    return { classes: [], functions: [], docstrings: [] };
  }
}