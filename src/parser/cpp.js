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

// capturing class methods: inline definitions + out-of-class definitions (Class::method)
const METHOD_QUERY = `
(class_specifier
  body: (field_declaration_list
    (function_definition
      declarator: (function_declarator
        declarator: (field_identifier) @method_name))))
(class_specifier
  body: (field_declaration_list
    (function_definition
      declarator: (function_declarator
        declarator: (identifier) @method_name))))
(function_definition
  declarator: (function_declarator
    declarator: (qualified_identifier
      name: (identifier) @method_name)))
`;

// capturing C++ block comments (/** ... */ or /* ... */)
const DOCSTRING_QUERY = `
(comment) @doc
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

    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);

    const methodQuery = new Parser.Query(grammar, METHOD_QUERY);
    const methodCaptures = methodQuery.captures(astRoot);
    const methods = methodCaptures.map(c => c.node.text);

    const methodKeys = new Set(
      methodCaptures.map(c => `${c.node.startIndex}-${c.node.endIndex}`)
    );
    const functions = captures
      .filter(c => (c.name === 'func_name' || c.name === 'ns_name') && !methodKeys.has(`${c.node.startIndex}-${c.node.endIndex}`))
      .map(c => c.node.text);

    const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
    const docCaptures = docQuery.captures(astRoot);
    const docstrings = docCaptures
      .map(c => c.node.text)
      .filter(t => t.startsWith('/**') || t.startsWith('/*') || t.startsWith('//'));

    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}