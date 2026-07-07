import Cpp from 'tree-sitter-cpp';
import Parser from 'tree-sitter';

export const grammar = Cpp;

const DEPENDENCY_QUERY = `
(preproc_include path: (system_lib_string) @sys_path)
(preproc_include path: (string_literal) @str_path)
`;

const ENTITY_QUERY = `
(class_specifier name: (type_identifier) @class_name)
(function_definition declarator: (function_declarator declarator: (identifier) @func_name))
(namespace_definition name: (namespace_identifier) @ns_name)
`;

export function extractDependencies(astRoot) {
  try {
    const query = new Parser.Query(grammar, DEPENDENCY_QUERY);
    const captures = query.captures(astRoot);

    // Slice out the < > or " " from the include path
    return captures.map(c => c.node.text.slice(1, -1));
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