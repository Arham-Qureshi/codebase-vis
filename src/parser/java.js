import Java from 'tree-sitter-java';
import Parser from 'tree-sitter';

export const grammar = Java;

const DEPENDENCY_QUERY = `
(import_declaration (scoped_identifier) @import_path)
(import_declaration (identifier) @import_path)
`;

const ENTITY_QUERY = `
(class_declaration name: (identifier) @class_name)
(interface_declaration name: (identifier) @class_name)
(method_declaration name: (identifier) @func_name)
(constructor_declaration name: (identifier) @func_name)
`;

const METHOD_QUERY = `
(class_body
  (method_declaration name: (identifier) @method_name))
`;

const DOCSTRING_QUERY = `
(block_comment) @doc
(line_comment) @doc
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
    const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);

    const methodQuery = new Parser.Query(grammar, METHOD_QUERY);
    const methodCaptures = methodQuery.captures(astRoot);
    const methods = methodCaptures.map(c => c.node.text);

    const methodKeys = new Set(
      methodCaptures.map(c => `${c.node.startIndex}-${c.node.endIndex}`)
    );
    const functions = captures
      .filter(c => c.name === 'func_name' && !methodKeys.has(`${c.node.startIndex}-${c.node.endIndex}`))
      .map(c => c.node.text);

    const docQuery = new Parser.Query(grammar, DOCSTRING_QUERY);
    const docstrings = docQuery.captures(astRoot)
      .map(c => c.node.text)
      .filter(t => t.startsWith('/**'));

    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
