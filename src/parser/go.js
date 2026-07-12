import Go from 'tree-sitter-go';
import Parser from 'tree-sitter';

// language grammar for .go files
export const grammar = Go;

// capturing import paths
const DEPENDENCY_QUERY = `
(import_spec path: (string_literal) @import_path)
`;

// capturing types, functions, and methods
const ENTITY_QUERY = `
(type_declaration (type_spec name: (type_identifier) @class_name))
(function_declaration name: (identifier) @func_name)
(method_declaration name: (field_identifier) @method_name)
`;

// extracts all dependency paths
export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);
    
    // Remove the surrounding quotes from Go import string literals
    return captures.map(c => c.node.text.replace(/^"|"$/g, ''));
  } catch {
    return [];
  }
}

// extracts all top-level entity names
export function extractEntities(astRoot) {
  try {
    const query = new Parser.Query(grammar, ENTITY_QUERY);
    const captures = query.captures(astRoot);
    
    return captures.map(c => c.node.text);
  } catch {
    return [];
  }
}
