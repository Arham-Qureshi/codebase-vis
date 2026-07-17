import CSS from 'tree-sitter-css';
import Parser from 'tree-sitter';

export const grammar = CSS;

const IMPORT_STRING_QUERY = `
(import_statement (string_value) @import_path)
`;

const IMPORT_URL_QUERY = `
(import_statement (call_expression (arguments (string_value) @import_path)))
`;
const URL_QUOTED_QUERY = `
(declaration
  (call_expression
    (function_name) @_fn
    (arguments (string_value) @url_path)
    (#eq? @_fn "url")))
`;

const URL_PLAIN_QUERY = `
(declaration
  (call_expression
    (function_name) @_fn
    (arguments (plain_value) @url_path)
    (#eq? @_fn "url")))
`;

// strips leading/trailing quotes from a string
function stripQuotes(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

// extracts all dependency paths from CSS
export function extractDependencies(astRoot) {
  try {
    const importStringCaps = new Parser.Query(grammar, IMPORT_STRING_QUERY)
      .captures(astRoot).filter(c => c.name === 'import_path');

    const importUrlCaps = new Parser.Query(grammar, IMPORT_URL_QUERY)
      .captures(astRoot).filter(c => c.name === 'import_path');

    const urlQuotedCaps = new Parser.Query(grammar, URL_QUOTED_QUERY)
      .captures(astRoot).filter(c => c.name === 'url_path');

    const urlPlainCaps = new Parser.Query(grammar, URL_PLAIN_QUERY)
      .captures(astRoot).filter(c => c.name === 'url_path');

    const allPaths = [
      ...importStringCaps.map(c => stripQuotes(c.node.text)),
      ...importUrlCaps.map(c => stripQuotes(c.node.text)),
      ...urlQuotedCaps.map(c => stripQuotes(c.node.text)),
      ...urlPlainCaps.map(c => c.node.text),
    ];

    // deduplicate
    return [...new Set(allPaths)];
  } catch {
    return [];
  }
}

export function extractEntities() {
  return { classes: [], functions: [], methods: [], docstrings: [] };
}