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

const queryCache = new Map();

function getQueries(g) {
  if (!queryCache.has(g)) {
    queryCache.set(g, {
      deps: new Parser.Query(g, DEPENDENCY_QUERY),
      entities: new Parser.Query(g, ENTITY_QUERY),
      methods: new Parser.Query(g, METHOD_QUERY),
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
    const { entities, methods, docstrings } = getQueries(grammar);
    const captures = entities.captures(astRoot);

    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    const functions = captures
      .filter(c => c.name === 'func_name' || c.name === 'arrow_name')
      .map(c => c.node.text);

    const methodCaptures = methods.captures(astRoot);
    const methodList = methodCaptures.map(c => c.node.text);

    const docCaptures = docstrings.captures(astRoot);
    const docstringList = docCaptures
      .map(c => c.node.text)
      .filter(t => t.startsWith('/**'));

    return { classes, functions, methods: methodList, docstrings: docstringList };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}