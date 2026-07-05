import TypeScript from 'tree-sitter-typescript';
import Parser from 'tree-sitter';

// tree-sitter-typescript exports for .ts and tsx for .tsx
export const grammar = TypeScript.typescript;
export const tsxGrammar = TypeScript.tsx;

// capturing import/require/dynamic-import paths
const DEPENDENCY_QUERY = `
(import_statement source: (string (string_fragment) @import_path))
(call_expression
  function: (identifier) @_func_name
  arguments: (arguments (string (string_fragment) @require_path))
  (#eq? @_func_name "require"))
(call_expression
  function: (import)
  arguments: (arguments (string (string_fragment) @dyn_import_path)))
`;

// type_identifier for class names, not identifier
const ENTITY_QUERY = `
(class_declaration name: (type_identifier) @class_name)
(function_declaration name: (identifier) @func_name)
(variable_declarator name: (identifier) @arrow_name value: (arrow_function))
(variable_declarator name: (identifier) @func_expr_name value: (function_expression))
`;

// extracts all dependency paths 
export function extractDependencies(astRoot, lang = grammar) {
    try {
        const query = new Parser.Query(lang, DEPENDENCY_QUERY);
        const captures = query.captures(astRoot);

        return captures
            .filter(c => c.name !== '_func_name')
            .map(c => c.node.text);
    } catch {
        return [];
    }
}

// extracts all top-level entity names (classes, functions, arrow fns)
export function extractEntities(astRoot, lang = grammar) {
    try {
        const query = new Parser.Query(lang, ENTITY_QUERY);
        const captures = query.captures(astRoot);

        return captures.map(c => c.node.text);
    } catch {
        return [];
    }
}