import TypeScript from 'tree-sitter-typescript';

// tree-sitter-typescript exports for .ts and tsx for .tsx
export const grammar = TypeScript.typescript;
export const tsxGrammar = TypeScript.tsx;
