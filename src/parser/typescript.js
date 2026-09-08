import TypeScript from 'tree-sitter-typescript';
import Parser from 'tree-sitter';

// tree-sitter-typescript exports for .ts and tsx for .tsx
export const grammar = TypeScript.typescript;
export const tsxGrammar = TypeScript.tsx;

// capturing import/require/dynamic-import paths + re-exports
const DEPENDENCY_QUERY = `
(import_statement source: (string (string_fragment) @import_path))
(import_statement source: (string) @import_path)
(export_statement source: (string (string_fragment) @import_path))
(export_statement source: (string) @import_path)
(call_expression
  function: (identifier) @_func_name
  arguments: (arguments (string (string_fragment) @require_path))
  (#eq? @_func_name "require"))
(call_expression
  function: (identifier) @_func_name
  arguments: (arguments (string) @require_path)
  (#eq? @_func_name "require"))
(call_expression
  function: (member_expression object: (identifier) @_obj property: (property_identifier) @_prop)
  arguments: (arguments (string (string_fragment) @import_path))
  (#eq? @_obj "require") (#eq? @_prop "resolve"))
(call_expression
  function: (member_expression object: (identifier) @_obj property: (property_identifier) @_prop)
  arguments: (arguments (string) @import_path)
  (#eq? @_obj "require") (#eq? @_prop "resolve"))
(call_expression
  function: (import)
  arguments: (arguments (string (string_fragment) @dyn_import_path)))
(call_expression
  function: (import)
  arguments: (arguments (string) @dyn_import_path))
`;

// type_identifier for class names, not identifier — includes interface/enum/type per graphify parity
const ENTITY_QUERY = `
(class_declaration name: (type_identifier) @class_name)
(interface_declaration name: (type_identifier) @class_name)
(type_alias_declaration name: (type_identifier) @class_name)
(enum_declaration name: (identifier) @class_name)
(function_declaration name: (identifier) @func_name)
(variable_declarator name: (identifier) @arrow_name value: (arrow_function))
(variable_declarator name: (identifier) @func_expr_name value: (function_expression))
`;

// capturing class methods
const METHOD_QUERY = `
(method_definition name: (property_identifier) @method_name)
`;

// capturing JSDoc-style block comments (/** ... */)
const DOCSTRING_QUERY = `
(comment) @doc
`;

function stripQuotes(s) { return s.replace(/^['"`]|['"`]$/g, ''); }

// extracts all dependency paths 
export function extractDependencies(astRoot, lang = grammar) {
    try {
        const query = new Parser.Query(lang, DEPENDENCY_QUERY);
        const captures = query.captures(astRoot);
        const raw = captures.filter(c => !c.name.startsWith('_')).map(c => stripQuotes(c.node.text));
        return [...new Set(raw.filter(Boolean))];
    } catch {
        return [];
    }
}

// extracts structured entities: { classes, functions, methods, docstrings }
export function extractEntities(astRoot, lang = grammar) {
    try {
        const query = new Parser.Query(lang, ENTITY_QUERY);
        const captures = query.captures(astRoot);

        const classes = captures.filter(c => c.name === 'class_name').map(c => c.node.text);
        const functions = captures
            .filter(c => c.name === 'func_name' || c.name === 'arrow_name' || c.name === 'func_expr_name')
            .map(c => c.node.text);

        const methodQuery = new Parser.Query(lang, METHOD_QUERY);
        const methodCaptures = methodQuery.captures(astRoot);
        const methods = methodCaptures.map(c => c.node.text);

        const docQuery = new Parser.Query(lang, DOCSTRING_QUERY);
        const docCaptures = docQuery.captures(astRoot);
        const docstrings = docCaptures
            .map(c => c.node.text)
            .filter(t => t.startsWith('/**'));

        return { classes, functions, methods, docstrings };
    } catch {
        return { classes: [], functions: [], methods: [], docstrings: [] };
    }
}