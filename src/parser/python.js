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

    return captures.map(c => c.node.text);
  } catch {
    return [];
  }
}
