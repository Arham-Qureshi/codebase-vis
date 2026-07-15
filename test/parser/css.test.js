import { test } from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';

async function parseCode(source) {
  const { grammar, extractDependencies, extractEntities } = await import('../../src/parser/css.js');
  const parser = new Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(source);
  return {
    dependencies: extractDependencies(tree.rootNode, grammar),
    entities: extractEntities(tree.rootNode, grammar),
  };
}

test('extractDependencies detects @import "path"', async () => {
  const result = await parseCode('@import "reset.css";');
  assert.ok(result.dependencies.includes('reset.css'));
});

test('extractDependencies detects @import url("path")', async () => {
  const result = await parseCode('@import url("theme.css");');
  assert.ok(result.dependencies.includes('theme.css'));
});

test('extractDependencies detects url() in declarations (quoted)', async () => {
  const result = await parseCode('.bg { background: url("bg.png"); }');
  assert.ok(result.dependencies.includes('bg.png'));
});

test('extractDependencies detects url() in declarations (unquoted)', async () => {
  const result = await parseCode('.bg { background: url(bg.png); }');
  assert.ok(result.dependencies.includes('bg.png'));
});

test('extractDependencies deduplicates results', async () => {
  const result = await parseCode('@import "shared.css"; @import url("shared.css");');
  const count = result.dependencies.filter(d => d === 'shared.css').length;
  assert.equal(count, 1);
});

test('extractDependencies returns empty for no deps', async () => {
  const result = await parseCode('body { color: red; }');
  assert.deepEqual(result.dependencies, []);
});

test('extractEntities returns empty object', async () => {
  const result = await parseCode('body { margin: 0; }');
  assert.deepEqual(result.entities, { classes: [], functions: [], docstrings: [] });
});
