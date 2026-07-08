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

export function extractDependencies(astRoot) {
  try {
    const elementQuery = new Parser.Query(grammar, ELEMENT_DEP_QUERY);
    const scriptQuery = new Parser.Query(grammar, SCRIPT_DEP_QUERY);

    const elementPaths = elementQuery.captures(astRoot)
      .filter(c => c.name === 'path')
      .map(c => c.node.text);

    const scriptPaths = scriptQuery.captures(astRoot)
      .filter(c => c.name === 'path')
      .map(c => c.node.text);

    return [...elementPaths, ...scriptPaths];
  } catch {
    return [];
  }
}

export function extractEntities() {
  return { classes: [], functions: [], docstrings: [] };
}