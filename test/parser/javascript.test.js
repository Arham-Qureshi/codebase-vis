import { test } from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';

async function parseCode(source) {
  const { grammar, extractDependencies, extractEntities } = await import('../../src/parser/javascript.js');
  const parser = new Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(source);
  return {
    dependencies: extractDependencies(tree.rootNode, grammar),
    entities: extractEntities(tree.rootNode, grammar),
  };
}

test('extractDependencies detects ES import', async () => {
  const result = await parseCode("import { foo } from 'bar';");
  assert.ok(result.dependencies.includes('bar'));
});

test('extractDependencies detects named and default imports', async () => {
  const result = await parseCode("import x, { a, b } from 'y';");
  assert.ok(result.dependencies.includes('y'));
});

test('extractDependencies detects require call', async () => {
  const result = await parseCode("const x = require('lodash');");
  assert.ok(result.dependencies.includes('lodash'));
});

test('extractDependencies detects dynamic import', async () => {
  const result = await parseCode("const x = import('dynamic');");
  assert.ok(result.dependencies.includes('dynamic'));
});

test('extractDependencies returns empty for file with no imports', async () => {
  const result = await parseCode('const x = 42;');
  assert.deepEqual(result.dependencies, []);
});

test('extractDependencies returns empty for empty string', async () => {
  const result = await parseCode('');
  assert.deepEqual(result.dependencies, []);
});

test('extractDependencies handles syntax error gracefully', async () => {
  const result = await parseCode('const x = ;;;');
  assert.ok(Array.isArray(result.dependencies));
});

test('extractEntities extracts class names', async () => {
  const result = await parseCode('class MyClass {}');
  assert.ok(result.entities.classes.includes('MyClass'));
});

test('extractEntities extracts function declarations', async () => {
  const result = await parseCode('function doStuff() {}');
  assert.ok(result.entities.functions.includes('doStuff'));
});

test('extractEntities extracts arrow functions assigned to variables', async () => {
  const result = await parseCode('const handler = () => {};');
  assert.ok(result.entities.functions.includes('handler'));
});

test('extractEntities extracts methods from class body', async () => {
  const result = await parseCode('class X { myMethod() {} #privateMethod() {} }');
  assert.ok(result.entities.methods.includes('myMethod'));
});

test('extractEntities extracts JSDoc comments', async () => {
  const result = await parseCode('/** This is a docstring */\nconst x = 1;');
  assert.ok(result.entities.docstrings.length > 0);
  assert.ok(result.entities.docstrings[0].includes('This is a docstring'));
});

test('extractEntities returns empty for file with no entities', async () => {
  const result = await parseCode('const x = 42;');
  assert.equal(result.entities.classes.length, 0);
  assert.equal(result.entities.functions.length, 0);
  assert.equal(result.entities.methods.length, 0);
});

test('extractEntities methods capture class methods, functions capture top-level declarations', async () => {
  const result = await parseCode('function topFn() {}\nclass C { myMethod() {} }');
  assert.ok(result.entities.functions.includes('topFn'));
  assert.ok(!result.entities.methods.includes('topFn'));
  assert.ok(result.entities.methods.includes('myMethod'));
});

test('multiple imports all captured', async () => {
  const result = await parseCode(`
    import fs from 'fs';
    import path from 'path';
    const x = require('express');
  `);
  assert.ok(result.dependencies.includes('fs'));
  assert.ok(result.dependencies.includes('path'));
  assert.ok(result.dependencies.includes('express'));
});
