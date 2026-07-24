# Contributing

## Setup

```bash
git clone https://github.com/Arham-Qureshi/codebase-vis.git
cd codebase-vis
npm install
```

Requires a C++ compiler for tree-sitter native modules. See [Prerequisites](README.md#prerequisites).

## Project Structure

```
bin/
  codebase-vis.js          — CLI entry point (commander)
src/
  cli/
    commands/
      clean.js             — Clean codebase-vis cache
      path.js              — Get codebase-vis path
      query.js             — Query codebase-vis graph
      init.js              — Initialize codebase-vis for a project
      generate.js          — Generate codebase-vis graph
      serve.js             — Serve codebase-vis graph
      explain.js           — Explain codebase-vis graph
    shared.js
  parser/                  — tree-sitter language modules + worker pool
    index.js               — File dispatch + batch parser
    parse-worker.js        — Forked child process worker
    javascript.js          — JS grammar + dependency/entity extractors
    typescript.js          — TS grammar + dependency/entity extractors
    python.js              — Python grammar + dependency/entity extractors
    cpp.js                 — C++ grammar + dependency/entity extractors
    html.js                — HTML grammar + dependency/entity extractors
    css.js                 — CSS grammar + dependency/entity extractors
    stack-detector.js        — Tech stack auto-detection
  graph/
    builder.js               — Build graphology graph from parsed data
    enricher.js              — Louvain clustering + color/community assignment
    formatter.js             — Export graph to JSON
  templates/
    graph/
      frame.html             — HTML skeleton
      style.css              — Visual styles
      script.js              — Visualizer logic
    graph-template.js        — Assembles frame + CSS + JS → self-contained HTML
  utils/
    traversal.js             — File discovery with ignore support
    cache.js                 — Incremental parse cache (mtime + size)
    worker-pool.js           — Fork-based worker pool
    file-system.js           — Sandboxed file writes
test/                        — Node test runner tests (node --test)
USAGE.md                     — Command examples with screenshots
```

## Running Tests

```bash
npm test
```

Tests use Node.js built-in `node --test`. No test framework to install.

## Code Style

- ESM only (`import`/`export`, no `require`)
- No JSDoc comments
- Follow existing patterns in adjacent files
- Use `picocolors` for terminal colors, `@clack/prompts` for spinners/prompts

## Adding a Language Parser

1. Create `src/parser/<lang>.js` exporting `grammar`, `extractDependencies(rootNode, grammar)`, and `extractEntities(rootNode, grammar)`
2. Register in `GRAMMAR_MAP` in both `src/parser/index.js` and `src/parser/parse-worker.js`
3. Add extension → language mapping to `LANGUAGE_MAP` in `src/graph/enricher.js`
4. Add stack-specific ignores to `STACK_IGNORES` in `src/cli/commands/generate.js` and `src/cli/commands/init.js`

## Pull Request Guidelines

- One feature or fix per PR
- Include tests for new parsers or logic changes
- Run `npm test` before pushing
- Do not add CDN dependencies — the visualizer must work offline
- No package-lock changes unless adding/removing a dependency

## Release Process

```bash
npm version patch   # or minor / major
git push --follow-tags
# Create a GitHub Release → npm publish runs automatically
```
