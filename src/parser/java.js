import Java from 'tree-sitter-java';
import Parser from 'tree-sitter';

// language grammar for .java files
export const grammar = Java;

// capturing import paths
const DEPENDENCY_QUERY = `
(import_declaration (scoped_identifier) @import_path)
(import_declaration (identifier) @import_path)
`;

// capturing classes, interfaces, methods, and constructors
const ENTITY_QUERY = `
(class_declaration name: (identifier) @class_name)
(interface_declaration name: (identifier) @class_name)
(method_declaration name: (identifier) @func_name)
(constructor_declaration name: (identifier) @func_name)
`;

// extracts all dependency paths
export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);
    
    return captures.map(c => c.node.text);
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
