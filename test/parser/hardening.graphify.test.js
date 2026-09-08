import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';

async function jsDeps(code) {
  const { grammar, extractDependencies } = await import('../../src/parser/javascript.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractDependencies(p.parse(code).rootNode);
}
async function tsDeps(code, useTSX=false) {
  const { grammar, tsxGrammar, extractDependencies } = await import('../../src/parser/typescript.js');
  const p = new Parser(); p.setLanguage(useTSX? tsxGrammar : grammar);
  return extractDependencies(p.parse(code).rootNode, p.getLanguage());
}
async function tsEnts(code, useTSX=false) {
  const { grammar, tsxGrammar, extractEntities } = await import('../../src/parser/typescript.js');
  const p = new Parser(); p.setLanguage(useTSX? tsxGrammar : grammar);
  return extractEntities(p.parse(code).rootNode, p.getLanguage());
}
async function pyEnts(code) {
  const { grammar, extractEntities } = await import('../../src/parser/python.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractEntities(p.parse(code).rootNode);
}
async function cppEnts(code) {
  const { grammar, extractEntities } = await import('../../src/parser/cpp.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractEntities(p.parse(code).rootNode);
}
async function javaEnts(code) {
  const { grammar, extractEntities } = await import('../../src/parser/java.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractEntities(p.parse(code).rootNode);
}
async function javaDeps(code) {
  const { grammar, extractDependencies } = await import('../../src/parser/java.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractDependencies(p.parse(code).rootNode);
}
async function goDepsEnts(code, want='deps') {
  const { grammar, extractDependencies, extractEntities } = await import('../../src/parser/go.js');
  const p = new Parser(); p.setLanguage(grammar);
  const t = p.parse(code);
  if (want==='deps') return extractDependencies(t.rootNode);
  return extractEntities(t.rootNode);
}
async function rustEnts(code) {
  const { grammar, extractEntities } = await import('../../src/parser/rust.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractEntities(p.parse(code).rootNode);
}
async function rustDeps(code) {
  const { grammar, extractDependencies } = await import('../../src/parser/rust.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractDependencies(p.parse(code).rootNode);
}
async function htmlDeps(code, includeNav=false) {
  const { grammar, extractDependencies } = await import('../../src/parser/html.js');
  const p = new Parser(); p.setLanguage(grammar);
  return extractDependencies(p.parse(code).rootNode, grammar, includeNav);
}

describe('graphify parity — JS/TS deps', () => {
  test('js export * from', async () => {
    const d = await jsDeps("export * from './a';");
    assert.ok(d.some(x=>x.includes('a')), `export * missed ${d}`);
  });
  test('js export {x} from', async () => {
    const d = await jsDeps("export {x} from 'y';");
    assert.ok(d.includes('y'));
  });
  test('js require.resolve', async () => {
    const d = await jsDeps("require.resolve('pkg')");
    assert.ok(d.includes('pkg'));
  });
  test('js side-effect import fallback', async () => {
    const d = await jsDeps("import 'polyfill';");
    assert.ok(d.includes('polyfill'));
  });
  test('js import string fallback with quotes', async () => {
    const d = await jsDeps('import "lodash";');
    assert.ok(d.includes('lodash'));
  });
  test('ts re-export', async () => {
    const d = await tsDeps("export * from './mod';");
    assert.ok(d.some(x=>x.includes('mod')));
  });
  test('ts interface counted', async () => {
    const e = await tsEnts('interface Foo {}');
    assert.ok(e.classes.includes('Foo'));
  });
  test('ts type alias counted', async () => {
    const e = await tsEnts('type Bar = {x:number}');
    assert.ok(e.classes.includes('Bar'));
  });
  test('ts enum counted', async () => {
    const e = await tsEnts('enum E {A}');
    assert.ok(e.classes.includes('E'));
  });
  test('ts preserves class and function', async () => {
    const e = await tsEnts('class C {} function f(){}');
    assert.ok(e.classes.includes('C'));
    assert.ok(e.functions.includes('f'));
  });
});

describe('graphify parity — Go', () => {
  test('grouped imports', async () => {
    const d = await goDepsEnts('package main\nimport ( "fmt"\n _ "net/http" )');
    assert.ok(d.includes('fmt'));
    assert.ok(d.includes('net/http'));
  });
  test('raw string import', async () => {
    const d = await goDepsEnts('package main\nimport `fmt`');
    assert.equal(d.length,1);
    assert.ok(d[0].includes('fmt'));
  });
  test('interface type as class', async () => {
    const e = await goDepsEnts('package main\ntype Iface interface { Foo() }', 'ents');
    assert.ok(e.classes.includes('Iface'));
  });
  test('struct still class', async () => {
    const e = await goDepsEnts('package main\ntype S struct { X int }', 'ents');
    assert.ok(e.classes.includes('S'));
  });
});

describe('graphify parity — C++', () => {
  test('struct as class', async () => {
    const e = await cppEnts('struct MyStruct {};');
    assert.ok(e.classes.includes('MyStruct'));
  });
  test('class struct inherits', async () => {
    const e = await cppEnts('class Child : public Base {};');
    assert.ok((e.inherits||[]).includes('Base'), `inherits ${JSON.stringify(e.inherits)}`);
  });
  test('struct inherits', async () => {
    const e = await cppEnts('struct Child : Base {};');
    assert.ok((e.inherits||[]).includes('Base'));
  });
});

describe('graphify parity — Java', () => {
  test('star import base captured', async () => {
    const d = await javaDeps('import java.util.*;');
    assert.ok(d.some(x=>x.includes('java.util')));
  });
  test('scoped import', async () => {
    const d = await javaDeps('import java.util.List;');
    assert.ok(d.some(x=>x.includes('List')));
  });
  test('enum as class', async () => {
    const e = await javaEnts('enum Color { RED }');
    assert.ok(e.classes.includes('Color'));
  });
});

describe('graphify parity — Python docstring', () => {
  test('plain string not docstring', async () => {
    const e = await pyEnts('x = 1\ny = "hello"\nclass C:\n  """real doc"""\n  def m(self):\n    """m doc"""\n    pass');
    // docstrings should be 2 (class + method), not 3 with y="hello"
    assert.ok(e.docstrings.length >=2, `${e.docstrings.length}`);
    assert.ok(!e.docstrings.some(s=>s.includes('hello') && !s.includes('real')));
  });
  test('triple quoted captured', async () => {
    const e = await pyEnts('"""module doc"""\ndef foo():\n  """fn doc"""\n  pass');
    assert.ok(e.docstrings.length>=2);
  });
});

describe('graphify parity — Rust shape', () => {
  test('object shape not array', async () => {
    const e = await rustEnts('pub struct S{} pub fn foo(){}');
    assert.ok(!Array.isArray(e) && 'classes' in e);
    assert.ok(e.classes.includes('S'));
    assert.ok(e.functions.includes('foo'));
  });
  test('use dep leaf', async () => {
    const d = await rustDeps('use std::collections::HashMap;');
    assert.ok(d[0].includes('collections'));
  });
});

describe('graphify parity — HTML nav flag', () => {
  test('nav off by default', async () => {
    const d = await htmlDeps('<a href="/login">x</a>', false);
    assert.equal(d.length,0);
  });
  test('nav on when flagged', async () => {
    const d = await htmlDeps('<a href="/login">x</a>', true);
    assert.ok(d.includes('/login'));
  });
  test('resource still captured', async () => {
    const d = await htmlDeps('<link href="style.css"><script src="a.js"></script>');
    assert.ok(d.includes('style.css'));
    assert.ok(d.includes('a.js'));
  });
});
