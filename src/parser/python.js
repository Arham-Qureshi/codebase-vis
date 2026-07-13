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

    const methodQuery = new Parser.Query(grammar, METHOD_QUERY);
    const methodCaptures = methodQuery.captures(astRoot);
    const methods = methodCaptures.map(c => c.node.text);

    // Exclude class methods from top-level functions to avoid double-counting
    const methodSet = new Set(methods);
    const functions = captures
      .filter(c => c.name === 'func_name' && !methodSet.has(c.node.text))
      .map(c => c.node.text);

    const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
    const docCaptures = docQuery.captures(astRoot);
    const docstrings = docCaptures.map(c => c.node.text);

    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
