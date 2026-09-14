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
(enum_declaration name: (identifier) @class_name)
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

const RECORD_QUERY = `
(record_declaration name: (identifier) @class_name)
`;

const queryCache = new Map();

function getQueries(g) {
  if (!queryCache.has(g)) {
    queryCache.set(g, {
      deps: new Parser.Query(g, DEPENDENCY_QUERY),
      entities: new Parser.Query(g, ENTITY_QUERY),
      methods: new Parser.Query(g, METHOD_QUERY),
      docstrings: new Parser.Query(g, DOCSTRING_QUERY),
      records: new Parser.Query(g, RECORD_QUERY),
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

export function extractEntities(astRoot) {
  try {
    const { entities, records, methods: methodQuery, docstrings: docQuery } = getQueries(grammar);
    const captures = entities.captures(astRoot);
    let classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
    try {
      const recs = records.captures(astRoot).filter(c=>c.name==='class_name').map(c=>c.node.text);
      classes = [...new Set([...classes, ...recs])];
    } catch {}

    const methodCaptures = methodQuery.captures(astRoot);
    const methods = methodCaptures.map(c => c.node.text);

    const methodKeys = new Set(
      methodCaptures.map(c => `${c.node.startIndex}-${c.node.endIndex}`)
    );
    const functions = captures
      .filter(c => c.name === 'func_name' && !methodKeys.has(`${c.node.startIndex}-${c.node.endIndex}`))
      .map(c => c.node.text);

    const docstrings = docQuery.captures(astRoot)
      .map(c => c.node.text)
      .filter(t => t.startsWith('/**'));

    return { classes, functions, methods, docstrings };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
