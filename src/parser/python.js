import Python from 'tree-sitter-python';
import Parser from 'tree-sitter';

export const grammar = Python;

const DEPENDENCY_QUERY = `
(import_statement name: (dotted_name) @import_path)
(import_statement (aliased_import name: (dotted_name) @import_path))
(import_from_statement module_name: (dotted_name) @from_path)
(import_from_statement module_name: (relative_import) @from_path)
`;

const ENTITY_QUERY = `
(class_definition name: (identifier) @class_name)
(function_definition name: (identifier) @func_name)
`;

// capturing class methods (regular and decorated like @property)
const METHOD_QUERY = `
(class_definition
  body: (block
    (function_definition name: (identifier) @method_name)))
(class_definition
  body: (block
    (decorated_definition
      definition: (function_definition name: (identifier) @method_name))))
`;

// Python docstrings: string literals as standalone expressions (triple-quoted)
const DOCSTRING_QUERY = `
(expression_statement (string) @doc)
`;

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
    const { entities, methods: methodQuery, docstrings: docQuery } = getQueries(grammar);
    const captures = entities.captures(astRoot);

    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);

    const methodCaptures = methodQuery.captures(astRoot);
    const methods = methodCaptures.map(c => c.node.text);

    // Exclude method nodes from functions by AST position, not by name
    const methodKeys = new Set(
      methodCaptures.map(c => `${c.node.startIndex}-${c.node.endIndex}`)
    );
    const functions = captures
      .filter(c => c.name === 'func_name' && !methodKeys.has(`${c.node.startIndex}-${c.node.endIndex}`))
      .map(c => c.node.text);

    const docCaptures = docQuery.captures(astRoot);
    const docstrings = docCaptures.map(c => c.node.text).filter(t => t.startsWith('"""') || t.startsWith("'''") || t.startsWith('\"\"\"') || t.includes('\n'));

    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
