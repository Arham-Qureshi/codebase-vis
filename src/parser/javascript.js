import JavaScript from 'tree-sitter-javascript';
import Parser from 'tree-sitter';

// language grammar for .js and .jsx files
export const grammar = JavaScript;

// capturing import/require/dynamic-import paths + re-exports + side-effect imports
const DEPENDENCY_QUERY = `
(import_statement source: (string (string_fragment) @import_path))
(import_statement source: (string) @import_path)
(export_statement source: (string (string_fragment) @import_path))
(export_statement source: (string) @import_path)
(call_expression
  function: (identifier) @_func_name
  arguments: (arguments (string (string_fragment) @require_path))
  (#eq? @_func_name "require"))
(call_expression
  function: (identifier) @_func_name
  arguments: (arguments (string) @require_path)
  (#eq? @_func_name "require"))
(call_expression
  function: (member_expression object: (identifier) @_obj property: (property_identifier) @_prop)
  arguments: (arguments (string (string_fragment) @import_path))
  (#eq? @_obj "require") (#eq? @_prop "resolve"))
(call_expression
  function: (member_expression object: (identifier) @_obj property: (property_identifier) @_prop)
  arguments: (arguments (string) @import_path)
  (#eq? @_obj "require") (#eq? @_prop "resolve"))
(call_expression
  function: (import)
  arguments: (arguments (string (string_fragment) @dyn_import_path)))
(call_expression
  function: (import)
  arguments: (arguments (string) @dyn_import_path))
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

// capturing class methods (public and private)
const METHOD_QUERY = `
(method_definition name: (property_identifier) @method_name)
(method_definition name: (private_property_identifier) @method_name)
`;

// capturing JSDoc-style block comments (/** ... */)
const DOCSTRING_QUERY = `
(comment) @doc
`;

function stripQuotes(s) { return s.replace(/^['"`]|['"`]$/g, ''); }

// extracts all dependency paths
export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);
    const raw = captures
      .filter(c => !c.name.startsWith('_'))
      .map(c => stripQuotes(c.node.text));
    return [...new Set(raw.filter(Boolean))];
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
    const functions = captures
      .filter(c => c.name === 'func_name' || c.name === 'arrow_name')
      .map(c => c.node.text);

    const methodQuery = new Parser.Query(grammar, METHOD_QUERY);
    const methodCaptures = methodQuery.captures(astRoot);
    const methods = methodCaptures.map(c => c.node.text);

    const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
    const docCaptures = docQuery.captures(astRoot);
    const docstrings = docCaptures
      .map(c => c.node.text)
      .filter(t => t.startsWith('/**'));

    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}