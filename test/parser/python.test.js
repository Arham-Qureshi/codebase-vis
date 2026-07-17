import { test } from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';

async function parseCode(source) {
  const { grammar, extractDependencies, extractEntities } = await import('../../src/parser/python.js');
  const parser = new Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(source);
  return {
    dependencies: extractDependencies(tree.rootNode, grammar),
    entities: extractEntities(tree.rootNode, grammar),
  };
}

test('extractDependencies detects import x', async () => {
  const result = await parseCode('import os');
  assert.ok(result.dependencies.includes('os'));
});

test('extractDependencies detects from x import y', async () => {
  const result = await parseCode('from pathlib import Path');
  assert.ok(result.dependencies.includes('pathlib'));
});

test('extractDependencies detects relative import', async () => {
  const result = await parseCode('from .utils import helper');
  assert.ok(result.dependencies.includes('.utils'));
});

test('extractDependencies detects aliased import', async () => {
  const result = await parseCode('import numpy as np');
  assert.ok(result.dependencies.includes('numpy'));
});

test('extractDependencies returns empty for file with no imports', async () => {
  const result = await parseCode('x = 42');
  assert.deepEqual(result.dependencies, []);
});

test('extractEntities extracts class definitions', async () => {
  const result = await parseCode('class MyClass:\n    pass');
  assert.ok(result.entities.classes.includes('MyClass'));
});

test('extractEntities extracts function definitions', async () => {
  const result = await parseCode('def do_stuff():\n    pass');
  assert.ok(result.entities.functions.includes('do_stuff'));
});

test('extractEntities extracts methods inside class', async () => {
  const result = await parseCode('class X:\n    def method1(self):\n        pass');
  assert.ok(result.entities.methods.includes('method1'));
});

test('extractEntities extracts methods with decorators', async () => {
  const result = await parseCode('class X:\n    @property\n    def name(self):\n        return 1');
  assert.ok(result.entities.methods.includes('name'));
});

test('extractEntities deduplicates methods from top-level functions', async () => {
  const result = await parseCode('class X:\n    def method1(self):\n        pass\ndef method1():\n    pass');
  assert.ok(result.entities.functions.includes('method1'));
  assert.ok(result.entities.methods.includes('method1'));
});

test('extractEntities extracts docstrings', async () => {
  const result = await parseCode("'''module docstring'''\ndef fn():\n    '''fn doc'''\n    pass");
  assert.ok(result.entities.docstrings.length > 0);
});

test('extractEntities returns empty for file with no entities', async () => {
  const result = await parseCode('x = 42');
  assert.equal(result.entities.classes.length, 0);
});

test('multiple imports all captured', async () => {
  const result = await parseCode('import os\nimport sys\nfrom collections import defaultdict');
  assert.ok(result.dependencies.includes('os'));
  assert.ok(result.dependencies.includes('sys'));
  assert.ok(result.dependencies.includes('collections'));
});
