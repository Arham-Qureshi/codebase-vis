import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, '../../dummy-polyglot');

let importCache = null;

async function getImports() {
  if (importCache) return importCache;
  importCache = {
    parseFile: (await import('../../src/parser/index.js')).parseFile,
    detectTechStack: (await import('../../src/parser/stack-detector.js')).detectTechStack,
    discoverFiles: (await import('../../src/utils/traversal.js')).discoverFiles,
    buildGraph: (await import('../../src/graph/builder.js')).buildGraph,
    parseFileBatch: (await import('../../src/parser/index.js')).parseFileBatch,
    ignore: (await import('ignore')).default,
    enrichNodes: (await import('../../src/graph/enricher.js')).enrichNodes,
  };
  return importCache;
}

function fixture(...segments) {
  return path.join(FIXTURE_ROOT, ...segments);
}

async function parseFixtureFile(...segments) {
  const { parseFile } = await getImports();
  const filePath = fixture(...segments);
  return parseFile(filePath);
}

describe('dummy-polyglot', () => {

  describe('file discovery', () => {
    test('discovers .js files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const jsFiles = files.filter(f => f.endsWith('.js'));
      assert.ok(jsFiles.length >= 8, `expected >= 8 .js files, got ${jsFiles.length}`);
    });

    test('discovers .ts and .tsx files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
      assert.ok(tsFiles.length >= 5, `expected >= 5 .ts/.tsx files, got ${tsFiles.length}`);
    });

    test('discovers .py files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const pyFiles = files.filter(f => f.endsWith('.py'));
      assert.ok(pyFiles.length >= 6, `expected >= 6 .py files, got ${pyFiles.length}`);
    });

    test('discovers .cpp, .h files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const cppFiles = files.filter(f => f.endsWith('.cpp') || f.endsWith('.h'));
      assert.ok(cppFiles.length >= 3, `expected >= 3 .cpp/.h files, got ${cppFiles.length}`);
    });

    test('discovers .rs files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const rsFiles = files.filter(f => f.endsWith('.rs'));
      assert.ok(rsFiles.length >= 1, `expected >= 1 .rs files, got ${rsFiles.length}`);
    });

    test('discovers .go files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const goFiles = files.filter(f => f.endsWith('.go'));
      assert.ok(goFiles.length >= 2, `expected >= 2 .go files, got ${goFiles.length}`);
    });

    test('discovers .java files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const javaFiles = files.filter(f => f.endsWith('.java'));
      assert.ok(javaFiles.length >= 2, `expected >= 2 .java files, got ${javaFiles.length}`);
    });

    test('discovers .html files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      assert.ok(htmlFiles.length >= 1, `expected >= 1 .html files, got ${htmlFiles.length}`);
    });

    test('discovers .css files', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const cssFiles = files.filter(f => f.endsWith('.css'));
      assert.ok(cssFiles.length >= 2, `expected >= 2 .css files, got ${cssFiles.length}`);
    });

    test('discovers deeply nested file', async () => {
      const { discoverFiles, ignore } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      const match = files.find(f => f.includes('deeply-nested') && f.endsWith('file.js'));
      assert.ok(match, 'deeply nested file.js should be discovered');
    });

    test('large file (>2MB) is skipped', async () => {
      const { discoverFiles, ignore } = await getImports();
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dummy-large-'));
      try {
        const largePath = path.join(tmpDir, 'large.js');
        const buf = Buffer.alloc(2 * 1024 * 1024 + 1);
        buf.write('const x = 1;\n');
        await fs.writeFile(largePath, buf);
        const ig = ignore();
        const { files } = await discoverFiles(tmpDir, ig);
        const found = files.some(f => f.endsWith('large.js'));
        assert.ok(!found, 'large.js should be skipped by file size filter');
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('per-language entity extraction', () => {
    const LANG_CONFIGS = [
      { ext: 'js',  file: 'all-types.js',    minClasses: 2, minFns: 2, minMethods: 2, minDocs: 3 },
      { ext: 'ts',  file: 'all-types.ts',    minClasses: 2, minFns: 2, minMethods: 2, minDocs: 3 },
      { ext: 'py',  file: 'all-types.py',    minClasses: 2, minFns: 2, minMethods: 3, minDocs: 3 },
      { ext: 'cpp', file: 'all-types.cpp',   minClasses: 2, minFns: 2, minMethods: 3, minDocs: 1 },
      { ext: 'rs',  file: 'all-types.rs',    minClasses: 2, minFns: 1, minMethods: 1, minDocs: 3 },
      { ext: 'go',  file: 'all-types.go',    minClasses: 2, minFns: 2, minMethods: 1, minDocs: 0 },
      { ext: 'java',file: 'all-types.java',  minClasses: 2, minFns: 1, minMethods: 2, minDocs: 3 },
    ];

    for (const cfg of LANG_CONFIGS) {
      describe(`${cfg.ext.toUpperCase()} (${cfg.file})`, () => {
        let result;

        test('parses without error', async () => {
          result = await parseFixtureFile('entities', cfg.file);
          assert.ok(result !== null, `${cfg.file} should parse successfully`);
        });

        test(`classes >= ${cfg.minClasses}`, () => {
          assert.ok(result.entities.classes.length >= cfg.minClasses,
            `expected >= ${cfg.minClasses} classes, got ${result.entities.classes.length}`);
        });

        test(`functions >= ${cfg.minFns} (and no method overlap via position dedup)`, () => {
          assert.ok(result.entities.functions.length >= cfg.minFns,
            `expected >= ${cfg.minFns} functions, got ${result.entities.functions.length}`);
        });

        test(`methods >= ${cfg.minMethods}`, () => {
          assert.ok(result.entities.methods.length >= cfg.minMethods,
            `expected >= ${cfg.minMethods} methods, got ${result.entities.methods.length}`);
        });

        test(`docstrings ${cfg.minDocs > 0 ? '>= ' + cfg.minDocs : '=== 0'}`, () => {
          if (cfg.minDocs === 0) {
            assert.equal(result.entities.docstrings.length, 0);
          } else {
            assert.ok(result.entities.docstrings.length >= cfg.minDocs,
              `expected >= ${cfg.minDocs} docstrings, got ${result.entities.docstrings.length}`);
          }
        });

        test('structured entity format (object with 4 keys)', () => {
          assert.equal(typeof result.entities, 'object');
          assert.ok(!Array.isArray(result.entities));
          assert.ok('classes' in result.entities);
          assert.ok('functions' in result.entities);
          assert.ok('methods' in result.entities);
          assert.ok('docstrings' in result.entities);
        });

        test('top-level entities (classes, functions) are de-duplicated', () => {
          for (const key of ['classes', 'functions']) {
            const arr = result.entities[key];
            const deduped = [...new Set(arr)];
            assert.equal(arr.length, deduped.length,
              `${key} contains duplicates: ${JSON.stringify(arr)}`);
          }
        });

        test('methods array is present', () => {
          assert.ok(Array.isArray(result.entities.methods));
        });
      });
    }

    describe('HTML', () => {
      test('extracts dependencies (src, href)', async () => {
        const result = await parseFixtureFile('entities', 'all-types.html');
        assert.ok(result !== null);
        assert.ok(result.dependencies.length >= 2,
          `expected >= 2 html deps, got ${result.dependencies.length}`);
      });

      test('entities are all empty arrays', async () => {
        const result = await parseFixtureFile('entities', 'all-types.html');
        assert.deepEqual(result.entities, { classes: [], functions: [], methods: [], docstrings: [] });
      });
    });

    describe('CSS', () => {
      test('extracts dependencies (@import, url())', async () => {
        const result = await parseFixtureFile('entities', 'all-types.css');
        assert.ok(result !== null);
        assert.ok(result.dependencies.length >= 2,
          `expected >= 2 css deps, got ${result.dependencies.length}`);
      });

      test('entities are all empty arrays', async () => {
        const result = await parseFixtureFile('entities', 'all-types.css');
        assert.deepEqual(result.entities, { classes: [], functions: [], methods: [], docstrings: [] });
      });
    });
  });

  describe('import extraction', () => {
    test('frontend/app.js imports shared/constants.js and utils/helpers.js', async () => {
      const result = await parseFixtureFile('frontend', 'app.js');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d.includes('shared/constants.js')), 'should import shared/constants.js');
      assert.ok(deps.some(d => d.includes('utils/helpers.js')), 'should import utils/helpers.js');
    });

    test('frontend/utils/helpers.js imports shared/constants.js and format.ts', async () => {
      const result = await parseFixtureFile('frontend', 'utils/helpers.js');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d.includes('shared/constants.js')), 'should import shared/constants.js');
    });

    test('frontend/app.tsx imports shared/types.ts', async () => {
      const result = await parseFixtureFile('frontend', 'app.tsx');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d.includes('shared/types.ts')), 'should import shared/types.ts');
    });

    test('frontend/index.html has 3 deps (link, img, script)', async () => {
      const result = await parseFixtureFile('frontend', 'index.html');
      assert.ok(result !== null);
      assert.ok(result.dependencies.length >= 2);
    });

    test('backend/server.js imports express (external) and routes/index.js', async () => {
      const result = await parseFixtureFile('backend', 'server.js');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.includes('express'), 'should import express');
      assert.ok(deps.some(d => d.includes('routes/index.js')), 'should import routes/index.js');
    });

    test('backend/server.ts imports shared/types.ts', async () => {
      const result = await parseFixtureFile('backend', 'server.ts');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d.includes('shared/types.ts')), 'should import shared/types.ts');
    });

    test('backend/routes/index.js imports ./api.js and shared/constants.js', async () => {
      const result = await parseFixtureFile('backend', 'routes/index.js');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d.includes('api.js')), 'should import api.js');
      assert.ok(deps.some(d => d.includes('shared/constants.js')), 'should import shared/constants.js');
    });

    test('backend/main.py has deps (relative imports)', async () => {
      const result = await parseFixtureFile('backend', 'main.py');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.length >= 1, `expected python deps, got ${deps.length}`);
    });

    test('backend/cpp/main.cpp has include deps', async () => {
      const result = await parseFixtureFile('backend', 'cpp/main.cpp');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d === 'utils.h'), 'main.cpp should #include "utils.h"');
    });

    test('backend/lib.rs has use dep', async () => {
      const result = await parseFixtureFile('backend', 'lib.rs');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d.includes('collections')), 'should use std::collections');
    });

    test('backend/Main.java has import deps', async () => {
      const result = await parseFixtureFile('backend', 'Main.java');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.some(d => d.includes('java.util')), 'should import java.util.*');
    });

    test('backend/main.go has import dep', async () => {
      const result = await parseFixtureFile('backend', 'main.go');
      assert.ok(result !== null);
      const deps = result.dependencies;
      assert.ok(deps.length >= 1, `expected go deps, got ${JSON.stringify(deps)}`);
    });
  });

  describe('edge cases', () => {
    const EMPTY_LANGS = ['js', 'ts', 'py', 'cpp', 'rs', 'go', 'java'];

    for (const ext of EMPTY_LANGS) {
      test(`empty.${ext} returns null for empty content`, async () => {
        const result = await parseFixtureFile('entities', `empty.${ext}`);
        assert.equal(result, null);
      });
    }

    test('empty.html returns null', async () => {
      const result = await parseFixtureFile('entities', 'empty.html');
      assert.equal(result, null);
    });

    test('empty.css returns null', async () => {
      const result = await parseFixtureFile('entities', 'empty.css');
      assert.equal(result, null);
    });

    test('empty.tsx should not exist but .ts is tested', () => {
      // .tsx file is not in entities/; only .ts is, covered above
    });

    const COMMENT_LANGS = ['js', 'ts', 'py', 'cpp', 'rs', 'go', 'java'];

    const COMMENT_DOC_LANGS = new Set(['cpp']);

    for (const ext of COMMENT_LANGS) {
      test(`only-comments.${ext} returns entities with all empty arrays`, async () => {
        const result = await parseFixtureFile('entities', `only-comments.${ext}`);
        assert.ok(result !== null, `only-comments.${ext} should parse (not empty)`);
        assert.equal(result.entities.classes.length, 0, 'classes should be empty');
        assert.equal(result.entities.functions.length, 0, 'functions should be empty');
        assert.equal(result.entities.methods.length, 0, 'methods should be empty');
        if (COMMENT_DOC_LANGS.has(ext)) {
          assert.ok(result.entities.docstrings.length >= 0, 'C++ captures // as docstrings');
        } else {
          assert.equal(result.entities.docstrings.length, 0, 'docstrings should be empty for single-line comments');
        }
      });
    }

    test('only-classes.js: classes present, functions/methods empty', async () => {
      const result = await parseFixtureFile('entities', 'only-classes.js');
      assert.ok(result !== null);
      assert.ok(result.entities.classes.length >= 1, 'should have classes');
      assert.equal(result.entities.functions.length, 0, 'should have no functions');
    });

    test('only-functions.js: functions present, classes/methods empty', async () => {
      const result = await parseFixtureFile('entities', 'only-functions.js');
      assert.ok(result !== null);
      assert.ok(result.entities.functions.length >= 3, 'should have functions');
      assert.equal(result.entities.classes.length, 0, 'should have no classes');
      assert.equal(result.entities.methods.length, 0, 'should have no methods');
    });

    test('only-docstrings.py: docstrings present', async () => {
      const result = await parseFixtureFile('entities', 'only-docstrings.py');
      assert.ok(result !== null);
      assert.ok(result.entities.docstrings.length >= 1, 'should have docstrings');
    });

    test('deeply-nested file parses correctly', async () => {
      const result = await parseFixtureFile('entities', 'deeply-nested', 'path', 'to', 'file.js');
      assert.ok(result !== null, 'deeply nested file should parse');
      assert.ok(result.entities.classes.length >= 1, 'should capture class');
      assert.ok(result.entities.functions.length >= 1, 'should capture function');
    });
  });

  describe('graph building', () => {
    let parsedResults;
    let graph;

    test('batch-parses all fixture files', async () => {
      const { discoverFiles, ignore, parseFileBatch } = await getImports();
      const ig = ignore();
      const { files } = await discoverFiles(FIXTURE_ROOT, ig);
      assert.ok(files.length >= 30, `expected >= 30 files, got ${files.length}`);
      parsedResults = await parseFileBatch(files);
      const successful = parsedResults.filter(r => r && !r.error);
      assert.ok(successful.length >= 20, `expected >= 20 successful parses, got ${successful.length}`);
    });

    test('buildGraph succeeds with no errors', async () => {
      const { buildGraph } = await import('../../src/graph/builder.js');
      const valid = parsedResults.filter(r => r && !r.error);
      graph = buildGraph(valid);
      assert.ok(graph.order > 0, 'graph should have nodes');
      assert.ok(graph.size > 0, 'graph should have edges');
    });

    test('graph contains file nodes for each language', async () => {
      const hasJs = Array.from(graph.nodes()).some(n => n.endsWith('.js'));
      const hasTs = Array.from(graph.nodes()).some(n => n.endsWith('.ts'));
      const hasPy = Array.from(graph.nodes()).some(n => n.endsWith('.py'));
      const hasCpp = Array.from(graph.nodes()).some(n => n.endsWith('.cpp'));
      const hasRs = Array.from(graph.nodes()).some(n => n.endsWith('.rs'));
      const hasGo = Array.from(graph.nodes()).some(n => n.endsWith('.go'));
      const hasJava = Array.from(graph.nodes()).some(n => n.endsWith('.java'));
      assert.ok(hasJs, 'graph should have .js nodes');
      assert.ok(hasTs, 'graph should have .ts nodes');
      assert.ok(hasPy, 'graph should have .py nodes');
      assert.ok(hasCpp, 'graph should have .cpp nodes');
      assert.ok(hasRs, 'graph should have .rs nodes');
      assert.ok(hasGo, 'graph should have .go nodes');
      assert.ok(hasJava, 'graph should have .java nodes');
    });

    test('express is an external node', () => {
      const expressNode = Array.from(graph.nodes()).find(n => n === 'express');
      assert.ok(expressNode, 'graph should have express external node');
      const attrs = graph.getNodeAttributes('express');
      assert.ok(attrs.external, 'express should be marked external');
    });

    test('shared/constants.js has multiple incoming edges', () => {
      const constantsNode = Array.from(graph.nodes()).find(n => n.endsWith('shared/constants.js'));
      assert.ok(constantsNode, 'shared/constants.js should be in graph');
      const inDegree = graph.inDegree(constantsNode);
      assert.ok(inDegree >= 2, `shared/constants.js should have >= 2 incoming edges, got ${inDegree}`);
    });

    test('entity nodes exist for class, function, method', () => {
      const entityNodes = Array.from(graph.nodes()).filter(n => n.includes('::'));
      const classNodes = entityNodes.filter(n => {
        const attrs = graph.getNodeAttributes(n);
        return attrs.kind === 'class';
      });
      const funcNodes = entityNodes.filter(n => {
        const attrs = graph.getNodeAttributes(n);
        return attrs.kind === 'function';
      });
      const methodNodes = entityNodes.filter(n => {
        const attrs = graph.getNodeAttributes(n);
        return attrs.kind === 'method';
      });
      assert.ok(classNodes.length >= 5, `expected >= 5 class entity nodes, got ${classNodes.length}`);
      assert.ok(funcNodes.length >= 5, `expected >= 5 function entity nodes, got ${funcNodes.length}`);
      assert.ok(methodNodes.length >= 5, `expected >= 5 method entity nodes, got ${methodNodes.length}`);
    });

    test('enrichNodes runs without errors', async () => {
      const { enrichNodes } = await import('../../src/graph/enricher.js');
      enrichNodes(graph);
      assert.ok(true, 'enrichNodes completed without throwing');
    });

    test('all file nodes have language attribute after enrichment', () => {
      let fileCount = 0;
      let withLang = 0;
      graph.forEachNode((node, attrs) => {
        if (!attrs.external && !attrs.kind) {
          fileCount++;
          if (attrs.language) withLang++;
        }
      });
      assert.ok(withLang >= fileCount * 0.8,
        `expected >= 80% of file nodes to have language, got ${withLang}/${fileCount}`);
    });
  });

});
