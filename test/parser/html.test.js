import { test } from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';

async function parseCode(source) {
  const { grammar, extractDependencies, extractEntities } = await import('../../src/parser/html.js');
  const parser = new Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(source);
  return {
    dependencies: extractDependencies(tree.rootNode, grammar),
    entities: extractEntities(tree.rootNode, grammar),
  };
}

test('extractDependencies detects script src', async () => {
  const result = await parseCode('<script src="app.js"></script>');
  assert.ok(result.dependencies.includes('app.js'));
});

test('extractDependencies detects link href', async () => {
  const result = await parseCode('<link rel="stylesheet" href="style.css">');
  assert.ok(result.dependencies.includes('style.css'));
});

test('extractDependencies detects img src', async () => {
  const result = await parseCode('<img src="logo.png">');
  assert.ok(result.dependencies.includes('logo.png'));
});

test('extractDependencies returns empty for no deps', async () => {
  const result = await parseCode('<html><body><p>Hello</p></body></html>');
  assert.deepEqual(result.dependencies, []);
});

test('extractEntities returns empty object', async () => {
  const result = await parseCode('<html></html>');
  assert.deepEqual(result.entities, { classes: [], functions: [], methods: [], docstrings: [] });
});
