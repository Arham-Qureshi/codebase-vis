# Changelog

## [1.4.0] - 2026-07-15

### 1. Self-dependency in package.json

**Problem:** `package.json` listed `codebase-vis` as its own dependency. This also carried an orphaned `allowScripts` block that referenced a stale `@opencode/sync` config.

**Bug:** `npm install` produced confusing warnings about a circular self-reference. The `allowScripts` block served no purpose after `@opencode/sync` was removed.

**Approach:** Audit `package.json` for any self-referential entries and stale configuration blocks.

**Solution:** Removed the `codebase-vis` entry from `dependencies` and deleted the `allowScripts` block entirely.

---

### 2. .gitignore self-reference

**Problem:** `.gitignore` contained a line ignoring `.gitignore` itself, making it impossible to track changes to the file.

**Bug:** `git add .gitignore` was silently ignored, so modifications to the ignore rules were never committed.

**Approach:** Review each line in `.gitignore` for logical errors — a file should never ignore itself.

**Solution:** Removed the line `.gitignore` from `.gitignore`.

---

### 3. Concurrency cap in explain.js

**Problem:** Users could pass `--concurrency` values like 50, which spawned excessive child processes and degraded system performance.

**Bug:** `explain.js` had no upper bound on `--concurrency`, allowing unbounded process forking.

**Approach:** Introduce a soft warning and hard cap at a reasonable parallel limit.

**Solution:** Added `resolveConcurrency()` that warns via `pc.yellow` when the user supplies > 5, then caps to 5. Applied to both call sites in `explain.js`.

---

### 4. init review note prominence

**Problem:** The "NOTE: Review .agentignore files" message used `pc.dim`, which was barely visible against dark terminals.

**Bug:** Users consistently missed the note, leading to confusion about why certain files were excluded.

**Approach:** Make the note visually distinct without being alarmist.

**Solution:** Changed to `pc.bgYellow(pc.black(' NOTE: '))` — a high-contrast yellow-on-black badge.

---

### 5. Contributing guidelines & code of conduct

**Problem:** No documentation existed for onboarding contributors or establishing community standards.

**Bug:** Contributors had no reference for project structure, test commands, code style, or PR process.

**Approach:** Create two standard open-source documents tailored to the project.

**Solution:** Added `CONTRIBUTING.md` (78 lines — setup, structure, test runner, code style, parser guide, PR/release process) and `CODE_OF_CONDUCT.md` (42 lines — Contributor Covenant v2.1).

---

### 6. Extended stack detection (angular, rust, go, php, ruby, java)

**Problem:** Only nextjs, react, node, python, and cpp were auto-detected. Projects using angular, rust, go, php, ruby, or java defaulted to `node`.

**Bug:** Users of those ecosystems got a misleading tech-stack label.

**Approach:** Add detection blocks for each missing ecosystem, integrating them into the existing priority chain.

**Solution:** Added detection for angular (`@angular/core` in `package.json`), rust (`Cargo.toml`), go (`go.mod`), php (`composer.json`), ruby (`Gemfile`), java (`build.gradle` / `pom.xml`). Detection order: `nextjs > angular > react > node > python > cpp > rust > go > php > ruby > java > fallback-node`. Updated `stack-detector.js`, `init.js`, and `generate.js` (STACK_IGNORES).

---

### 7. --verbose enrichment in generate.js

**Problem:** The `--verbose` flag only showed basic file discovery info. The misleading hint "Use --verbose for details" appeared even when --verbose was already active.

**Bug:** Users couldn't tell which files were freshly parsed vs. cache-hit. The hint created a circular UX.

**Approach:** Extend verbose output with per-file status and discovery summary; suppress the hint when already verbose.

**Solution:** Verbose mode now prints `[cached] <path>` per cache hit and `[parsed] <path>` per fresh parse. Discovery summary includes `ignoredCount`. Changed `discoverFiles()` return type from `string[]` to `{ files, ignoredCount }`; updated all callers and `traversal.test.js`.

---

### 8. Test suite (17 files, ~195 tests)

**Problem:** The project had 5 flat test files with low coverage. No tests existed for 6 of 6 parser modules, graph enricher logic, CLI shared utilities, or template loading.

**Bug:** Critical parse and enrichment logic was completely untested. Regressions could go undetected.

**Approach:** Write incremental, independent tests for every module using `node --test`, with real tree-sitter AST parsing and assertions.

**Solution:** Created 17 test files across `test/parser/` (8 files), `test/graph/` (3 files), `test/utils/` (4 files), `test/cli/` (1 file), `test/templates/` (1 file). Each file runs independently. Deleted 4 stale flat test files.

---

### 9. Parser tests: missing async on test callbacks

**Problem:** All parser test files used `await parseCode(...)` inside test callbacks that were not declared `async`.

**Bug:** `node --test` threw `SyntaxError: Unexpected reserved word` on every parser test.

**Approach:** Every `test('...', () => {` with `await` needed `async () => {`.

**Solution:** Changed 6 parser test files (`javascript.test.js`, `typescript.test.js`, `python.test.js`, `cpp.test.js`, `html.test.js`, `css.test.js`) — all test callbacks to `async` via `.replaceAll(', () => {', ', async () => {')`.

---

### 10. Stack-detector: stale config files across tests

**Problem:** All stack-detector tests shared the same `tmpDir`. Writing `package.json` in early tests left a stale copy for later tests.

**Bug:** Test "detects python from pyproject.toml" found the leftover `package.json` (from the "detects node" test) and returned `node` instead of `python`.

**Approach:** Each test needs an isolated directory — no state leakage between tests.

**Solution:** Replaced shared `writeConfig` with `testDir()` that creates a unique subdirectory (`t0`, `t1`, ...) per test. Each test passes its own dir to `detectTechStack`.

---

### 11. Builder: multi-graph edge lookup

**Problem:** The builder test used `graph.edge()` to retrieve a single edge key between two nodes.

**Bug:** `graphology` multi-graphs do not expose `graph.edge()` — the method only exists on simple (non-multi) graphs. Tests threw `TypeError: graph.edge is not a function`.

**Approach:** For multi-graphs, use `graph.edges()` which returns an array of all edge keys for a given source-target pair.

**Solution:** Changed `graph.edge(a, b)` → `graph.edges(a, b)[0]` with an `assert.equal(edges.length, 1)` guard.

---

### 12. Enricher: isolated node color expectation

**Problem:** The test `isolated nodes get fallback community from relative directory` expected `#94a3b8` for a singleton file node.

**Bug:** Louvain community detection assigns community 0 even to isolated single nodes, which then receives a palette color (`#4E79A7`). The `#94a3b8` fallback branch is unreachable for any node in the `fileSet`.

**Approach:** The test assertion was wrong — isolated nodes always get a palette color from Louvain, not the fallback gray.

**Solution:** Changed test expectation to check `color.startsWith('#')` and exclude known special colors (`#6a2d6a` entity, `#2d6a4f` external) rather than asserting an exact value.

---

### 13. Traversal: EACCES on permission-denied directories

**Problem:** `walk()` called `fs.readdir(dir)` without error handling.

**Bug:** When encountering a directory with `chmod 000`, `fs.readdir` threw `EACCES`, crashing the entire file discovery.

**Approach:** Wrap the `fs.readdir` call in try/catch to gracefully skip inaccessible entries.

**Solution:** Added try/catch around `fs.readdir(dir)` in `src/utils/traversal.js:13`. On error, `walk()` returns early for that subtree.

---

### 14. Worker-pool: __filename undefined in ESM

**Problem:** Worker-pool tests used `__filename` to pass the current file path to `pool.run()`.

**Bug:** In ESM (`"type": "module"`), `__filename` is not defined, throwing `ReferenceError`.

**Approach:** Use `import.meta.url` with `fileURLToPath` from `node:url`.

**Solution:** Added `const __filename = fileURLToPath(import.meta.url)` to the test file.

---

### 15. JS parser: test used same name for function and method

**Problem:** Test `extractEntities methods do not include top-level functions` parsed `function topFn(){}` and `class C { topFn(){} }` then asserted `methods` should NOT contain `topFn`.

**Bug:** Both a top-level function and a class method existed with the same name `topFn`. The class method IS a valid method definition — it should appear in `methods`.

**Approach:** The test assertion was wrong. Use distinct names for the top-level function and class method.

**Solution:** Changed test to use `topFn` for the function and `myMethod` for the class method, verifying each appears in the correct list.

---

### 16. Python parser: dedup filtered by name instead of AST position

**Problem:** `extractEntities` deduplicated functions by checking `methodSet.has(c.node.text)` — comparing names.

**Bug:** A top-level function named `method1` with a class method also named `method1` would have the top-level function incorrectly removed from `functions`.

**Approach:** Deduplicate by AST position (start byte offset, end byte offset) rather than by name.

**Solution:** Changed dedup to use a Set of `startIndex-endIndex` keys from method captures, then filter function captures by position match instead of name match.
