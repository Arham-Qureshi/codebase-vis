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

const queryCache = new Map();

function getQueries(g) {
  if (!queryCache.has(g)) {
    queryCache.set(g, {
      importString: new Parser.Query(g, IMPORT_STRING_QUERY),
      importUrl: new Parser.Query(g, IMPORT_URL_QUERY),
      urlQuoted: new Parser.Query(g, URL_QUOTED_QUERY),
      urlPlain: new Parser.Query(g, URL_PLAIN_QUERY),
    });
  }
  return queryCache.get(g);
}

// extracts all dependency paths from CSS
export function extractDependencies(astRoot) {
  try {
    const { importString, importUrl, urlQuoted, urlPlain } = getQueries(grammar);

    const importStringCaps = importString.captures(astRoot)
      .filter(c => c.name === 'import_path');

    const importUrlCaps = importUrl.captures(astRoot)
      .filter(c => c.name === 'import_path');

    const urlQuotedCaps = urlQuoted.captures(astRoot)
      .filter(c => c.name === 'url_path');

    const urlPlainCaps = urlPlain.captures(astRoot)
      .filter(c => c.name === 'url_path');

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