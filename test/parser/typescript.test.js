import { test } from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';

async function parseCode(source, useTSX = false) {
  const { grammar, tsxGrammar, extractDependencies, extractEntities } = await import('../../src/parser/typescript.js');
  const parser = new Parser();
  parser.setLanguage(useTSX ? tsxGrammar : grammar);
  const tree = parser.parse(source);
  return {
    dependencies: extractDependencies(tree.rootNode, parser.getLanguage()),
    entities: extractEntities(tree.rootNode, parser.getLanguage()),
  };
}

test('extractDependencies detects ES import from .ts', async () => {
  const result = await parseCode("import { foo } from 'bar';");
  assert.ok(result.dependencies.includes('bar'));
});

test('extractDependencies detects type import', async () => {
  const result = await parseCode("import type { X } from 'types';");
  assert.ok(result.dependencies.includes('types'));
});

test('extractDependencies detects require in .ts', async () => {
  const result = await parseCode("const x = require('lodash');");
  assert.ok(result.dependencies.includes('lodash'));
});

test('extractDependencies handles .tsx with tsxGrammar', async () => {
  const result = await parseCode("import React from 'react'; const el = <div />;", true);
  assert.ok(result.dependencies.includes('react'));
});

test('extractEntities extracts class with type_identifier', async () => {
  const result = await parseCode('class MyClass {}');
  assert.ok(result.entities.classes.includes('MyClass'));
});

test('extractEntities extracts function declarations', async () => {
  const result = await parseCode('function doStuff(): void {}');
  assert.ok(result.entities.functions.includes('doStuff'));
});

test('extractEntities extracts arrow functions in TS', async () => {
  const result = await parseCode('const handler = () => {};');
  assert.ok(result.entities.functions.includes('handler'));
});

test('extractEntities extracts methods in TS', async () => {
  const result = await parseCode('class X { myMethod() {} }');
  assert.ok(result.entities.methods.includes('myMethod'));
});

test('extractEntities extracts function expressions in TS', async () => {
  const result = await parseCode('const handler = function() {};');
  assert.ok(result.entities.functions.includes('handler'));
});

test('extractEntities returns empty for file with no entities', async () => {
  const result = await parseCode('const x: number = 42;');
  assert.equal(result.entities.classes.length, 0);
});

test('use tsxGrammar without crashing on JSX', async () => {
  const result = await parseCode('const el = <div>hello</div>;', true);
  assert.ok(Array.isArray(result.dependencies));
  assert.ok(typeof result.entities === 'object');
});

test('extractDependencies returns empty for no imports', async () => {
  const result = await parseCode('const x = 42;');
  assert.deepEqual(result.dependencies, []);
});
