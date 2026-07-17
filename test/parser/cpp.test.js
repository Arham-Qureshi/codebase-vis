import { test } from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';

async function parseCode(source) {
  const { grammar, extractDependencies, extractEntities } = await import('../../src/parser/cpp.js');
  const parser = new Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(source);
  return {
    dependencies: extractDependencies(tree.rootNode, grammar),
    entities: extractEntities(tree.rootNode, grammar),
  };
}

test('extractDependencies detects system include', async () => {
  const result = await parseCode('#include <vector>');
  assert.ok(result.dependencies.includes('vector'));
});

test('extractDependencies detects local include', async () => {
  const result = await parseCode('#include "myheader.h"');
  assert.ok(result.dependencies.includes('myheader.h'));
});

test('extractDependencies strips angle brackets from system includes', async () => {
  const result = await parseCode('#include <iostream>');
  assert.ok(!result.dependencies.includes('<iostream>'));
  assert.ok(result.dependencies.includes('iostream'));
});

test('extractDependencies strips quotes from local includes', async () => {
  const result = await parseCode('#include "my.h"');
  assert.ok(!result.dependencies.includes('"my.h"'));
  assert.ok(result.dependencies.includes('my.h'));
});

test('extractDependencies returns multiple includes', async () => {
  const result = await parseCode('#include <vector>\n#include <string>\n#include "local.h"');
  assert.ok(result.dependencies.includes('vector'));
  assert.ok(result.dependencies.includes('string'));
  assert.ok(result.dependencies.includes('local.h'));
});

test('extractDependencies returns empty for file with no includes', async () => {
  const result = await parseCode('int main() { return 0; }');
  assert.deepEqual(result.dependencies, []);
});

test('extractEntities extracts class names', async () => {
  const result = await parseCode('class MyClass {};');
  assert.ok(result.entities.classes.includes('MyClass'));
});

test('extractEntities extracts function definitions', async () => {
  const result = await parseCode('int doStuff() { return 1; }');
  assert.ok(result.entities.functions.includes('doStuff'));
});

test('extractEntities extracts inline methods inside class', async () => {
  const result = await parseCode('class X { void method1() {} };');
  assert.ok(result.entities.methods.includes('method1'));
});

test('extractEntities extracts out-of-class qualified methods', async () => {
  const result = await parseCode('void X::method2() {}');
  assert.ok(result.entities.methods.includes('method2'));
});
