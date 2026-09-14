import HTML from 'tree-sitter-html';
import Parser from 'tree-sitter';

export const grammar = HTML;

// capturing src/href from <link>, <img>, and similar element tags
const ELEMENT_DEP_QUERY = `
(element
  (start_tag
    (tag_name) @_tag
    (attribute
      (attribute_name) @_attr
      (quoted_attribute_value (attribute_value) @path))
    (#match? @_tag "^(link|img)$")
    (#match? @_attr "^(src|href)$")))
`;

// capturing src from <script> tags (tree-sitter-html uses script_element)
const SCRIPT_DEP_QUERY = `
(script_element
  (start_tag
    (attribute
      (attribute_name) @_attr
      (quoted_attribute_value (attribute_value) @path))
    (#eq? @_attr "src")))
`;

const NAV_DEP_QUERY = `
(element
  (start_tag
    (tag_name) @_tag
    (attribute
      (attribute_name) @_attr
      (quoted_attribute_value (attribute_value) @path))
    (#match? @_tag "^(a|form|video|audio|source|iframe)$")
    (#match? @_attr "^(href|src|action|poster|data-src)$")))
`;

const queryCache = new Map();

function getQueries(g) {
  if (!queryCache.has(g)) {
    queryCache.set(g, {
      elementDep: new Parser.Query(g, ELEMENT_DEP_QUERY),
      scriptDep: new Parser.Query(g, SCRIPT_DEP_QUERY),
      navDep: new Parser.Query(g, NAV_DEP_QUERY),
    });
  }
  return queryCache.get(g);
}

export function extractDependencies(astRoot, _grammar, includeNav = false) {
  try {
    const { elementDep, scriptDep, navDep } = getQueries(grammar);

    const elementPaths = elementDep.captures(astRoot)
      .filter(c => c.name === 'path')
      .map(c => c.node.text);

    const scriptPaths = scriptDep.captures(astRoot)
      .filter(c => c.name === 'path')
      .map(c => c.node.text);

    let navPaths = [];
    if (includeNav) {
      navPaths = navDep.captures(astRoot).filter(c => c.name === 'path').map(c => c.node.text);
    }

    return [...elementPaths, ...scriptPaths, ...navPaths];
  } catch {
    return [];
  }
}

export function extractEntities() {
  return { classes: [], functions: [], methods: [], docstrings: [] };
}