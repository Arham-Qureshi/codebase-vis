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

// extracts structured entities: { classes, functions, docstrings }
export function extractEntities(astRoot) {
  try {
    const query = new Parser.Query(grammar, ENTITY_QUERY);
    const captures = query.captures(astRoot);

    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    const functions = captures.filter(c => c.name === 'func_name').map(c => c.node.text);

    const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
    const docCaptures = docQuery.captures(astRoot);
    const docstrings = docCaptures.map(c => c.node.text);

    return { classes, functions, docstrings };
  } catch {
    return { classes: [], functions: [], docstrings: [] };
  }
}
