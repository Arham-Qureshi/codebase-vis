import Go from 'tree-sitter-go';
import Parser from 'tree-sitter';

export const grammar = Go;

const DEPENDENCY_QUERY = `
(import_spec path: (interpreted_string_literal) @import_path)
(import_spec path: (raw_string_literal) @import_path)
`;

const ENTITY_QUERY = `
(type_declaration (type_spec name: (type_identifier) @class_name))
(function_declaration name: (identifier) @func_name)
(method_declaration name: (field_identifier) @method_name)
`;

const queryCache = new Map();

function getQueries(g) {
  if (!queryCache.has(g)) {
    queryCache.set(g, {
      deps: new Parser.Query(g, DEPENDENCY_QUERY),
      entities: new Parser.Query(g, ENTITY_QUERY),
    });
  }
  return queryCache.get(g);
}

export function extractDependencies(astRoot) {
  try {
    const { deps } = getQueries(grammar);
    const captures = deps.captures(astRoot);
    return captures.map(c => c.node.text.replace(/^["`]|["`]$/g, ''));
  } catch {
    return [];
  }
}

export function extractEntities(astRoot) {
  try {
    const { entities } = getQueries(grammar);
    const captures = entities.captures(astRoot);
    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    const functions = captures.filter(c => c.name === 'func_name').map(c => c.node.text);
    const methods = captures.filter(c => c.name === 'method_name').map(c => c.node.text);
    return { classes, functions, methods, docstrings: [] };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}