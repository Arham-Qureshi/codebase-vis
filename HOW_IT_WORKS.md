# How It Works

A walkthrough of what happens when you run `codebase-vis generate`.

## The Pipeline

```
Source files on disk
  → discover files (respecting .agentignore)
  → check cache (skip unchanged files)
  → parse changed files in parallel (tree-sitter)
  → build dependency graph (graphology)
  → detect communities (Louvain algorithm)
  → export graph.json + graph.html
```

The whole thing runs locally. No API calls, no network, no telemetry. The `explain` command is the only exception — it optionally sends data to Groq for LLM summaries.

## File Discovery

`discoverFiles()` walks your project directory recursively. It respects `.agentignore` patterns (same syntax as `.gitignore`), skips files larger than 2MB, and only picks up files with known extensions (`.js`, `.ts`, `.py`, `.cpp`, `.go`, `.java`, `.rs`, `.html`, `.css`). Directories like `node_modules/`, `.git/`, `dist/`, `build/`, and `codebase-out/` are always skipped.

The walker runs with a concurrency of 32 — it processes subdirectories in parallel batches, not one at a time.

## Incremental Cache

The tool maintains a `.cache.json` file inside `codebase-out/`. Each entry stores a file's parsed result alongside its `mtime` (modification time) and file size. On subsequent runs:

1. Every discovered file is `stat()`ed in parallel (batched by CPU count)
2. If `mtime` and `size` match the cache entry, the parsed data is reused — zero parsing cost
3. If they don't match (or the file is new), it's queued for fresh parsing
4. Files that were deleted since the last run are pruned from the cache

**The fast path:** If nothing changed (no new files, no modified files, no deleted files), the command exits in ~200ms. It detects this and skips graph building, JSON export, HTML copy, and cache save entirely.

**Cache sizing:** The cache is capped at 100,000 entries. When it exceeds that, the oldest entries (by `mtime`) are evicted.

## AST Parsing with Tree-sitter

Tree-sitter is a parser generator that produces concrete syntax trees from source code. Unlike regex-based extraction, it understands actual grammar — so `import { x } from 'y'` is correctly identified as an import, even if it spans multiple lines or contains comments.

Each language has its own parser module (`javascript.js`, `python.js`, etc.) that defines tree-sitter queries for two things:

**Dependency queries** — capture import/require/include statements:
- JavaScript/TypeScript: `import_statement`, `require()`, `import()`
- Python: `import_statement`, `import_from_statement`
- C++: `preproc_include`
- Go: `import_spec`
- Java: `import_declaration`
- Rust: `use_declaration`, `extern crate`
- HTML: `script[src]`, `link[href]`, `img[src]`
- CSS: `@import`, `url()`

**Entity queries** — capture classes, functions, methods, and docstrings. These become sub-nodes in the graph, connected to their parent file via dashed `contains` edges.

### Query Caching

Tree-sitter queries are compiled from S-expression strings into internal `Query` objects. This compilation is expensive. To avoid doing it 50,000 times for a 50k-file codebase, each parser module caches compiled queries in a module-level `Map` keyed by grammar instance. First file parse per grammar compiles the queries; every subsequent file reuses the cached objects.

This single optimization saves ~2,700x worth of redundant compilations on large codebases.

## Parallel Parsing

Parsing is CPU-bound — tree-sitter runs native C++ code under the hood. To maximize throughput, the tool uses a `WorkerPool` backed by Node.js `worker_threads`.

```
Main thread
  ├── Worker 1 (parses file A, file B, file C...)
  ├── Worker 2 (parses file D, file E, file F...)
  └── Worker N (parses file X, file Y, file Z...)
```

Each worker gets a file path, reads it, runs the tree-sitter parser, extracts dependencies and entities, and posts the result back. The main thread collects results in input order (preserving the original file list order regardless of completion order).

**Worker count:** Defaults to `os.availableParallelism() - 1` (e.g., 7 workers on an 8-core machine). Override with `--jobs`.

**Crash recovery:** If a worker crashes (bad file, segfault, etc.), the pool rejects that file's promise, spawns a replacement worker, and continues. One corrupted file won't stall the entire parse.

**Queue management:** The pool uses an index-based drain (not `Array.shift()`) to avoid O(n) queue compaction overhead. Queue limit is 100,000 pending tasks.

### Why worker_threads over fork()

The original implementation used `child_process.fork()`. The switch to `worker_threads` was motivated by three things:

1. **IPC speed:** `fork()` serializes data over pipes (JSON parse/stringify per message). `worker_threads` uses structured clone, which is 3-5x faster for the same payload.
2. **Startup cost:** `fork()` creates a full V8 heap + loads all native addons per worker. `worker_threads` shares the same V8 isolate and native module bindings.
3. **Memory:** 8 forked processes = ~400MB (separate heaps). 8 worker threads = ~100MB (shared heap).

On a 24k-file codebase, this difference alone saves ~100-200 seconds.

## Graph Construction

After parsing, `buildGraph()` constructs a directed multi-graph using [graphology](https://graphology.github.io/). Three types of nodes:

**File nodes** — one per source file, with a `dependencies` attribute listing what it imports.

**Entity sub-nodes** — classes, functions, methods extracted by tree-sitter. Connected to their parent file via dashed `contains` edges. Notation: `src/app.js::MyClass`.

**External package nodes** — npm packages (or other external imports) that aren't found in your local file tree. Marked with `{ external: true, npm: boolean }`.

Edges are either `imports` (file → file or file → package) or `contains` (file → entity).

### Dependency Resolution

When a file imports `'./utils'`, the tool resolves it relative to the importing file's directory. If the resolved path exists as a node in the graph, an `imports` edge is created. If not, the import is treated as an external package.

## Community Detection

`enrichNodes()` runs the [Louvain algorithm](https://en.wikipedia.org/wiki/Louvain_method) to group files into communities. The algorithm maximizes modularity — files that are densely connected by import edges end up in the same group.

The process:

1. Build an undirected subgraph of file-to-file edges (excluding entities and external packages)
2. Run Louvain on this subgraph → each file gets a community ID
3. Name each community by finding the most common directory among its files
4. If two communities share the same dominant directory, disambiguate with `#1`, `#2` suffixes
5. Assign colors from a 12-color palette

External packages get community `"dependencies"` (green). Entity nodes inherit their parent file's community (purple).

### Visual Attributes

After enrichment, every node gets:
- `size` — proportional to connection count (clamped 5–15 for files, 3 for entities)
- `color` — from the community palette
- `community` — the Louvain-assigned group name
- `language` — detected from file extension
- `label` — the file's basename

## Streaming JSON Export

`exportGraphToJson()` writes `graph.json` by iterating over the graph with `forEachNode()` and `forEachEdge()`, building JSON strings incrementally. This avoids materializing the entire graph as a plain JavaScript object (which `graph.export()` would do — ~60-100MB for large codebases).

Several dead attributes are stripped during export: `x`, `y`, `size`, `dependencies`, `depth`, `parent`, `scriptName` from nodes; `depth`, `linkText` from edges. These are either computed client-side by D3 (positions, sizes) or were never used by consumers.

The output format:
```json
{
  "options": { "type": "mixed", "multi": true },
  "nodes": [{ "key": "src/app.js", "attributes": { "label": "app.js", "community": "src", "color": "#4E79A7" } }],
  "edges": [{ "source": "src/app.js", "target": "src/utils.js", "attributes": { "relationship": "imports" } }]
}
```

## Interactive Visualization

`graph.html` is a self-contained single file. No build step, no npm dependencies, no CDN. It loads `graph.json` via `fetch()` at runtime and renders it with [D3](https://d3js.org/)'s force-directed layout.

The visualizer features:
- **Dark mode** with glassmorphism sidebar
- **Community legend** — toggle visibility of entire modules via color-coded checkboxes
- **Fuzzy search** across all node labels with smooth pan-to-node animation
- **Click-to-inspect** — clicking any node shows its module, language, connection count, and clickable neighbor links
- **Dependency/entity toggles** — quick-show/hide for npm packages and inline entities

Because the graph.json positions are random initial values, D3's force simulation recomputes the layout from scratch on every load. This is intentional — the physics-based layout produces natural clustering that stored positions can't match.

## Ignore System

File discovery uses a layered ignore system:

1. **Hardcoded ignores** — `node_modules/`, `.git/`, `dist/`, `build/`, `coverage/`, `codebase-out/`
2. **Non-code patterns** — `*.md`, `*.json`, `*.png`, fonts, etc.
3. **Stack-specific ignores** — detected from your tech stack (e.g., `venv/` for Python, `target/` for Rust)
4. **`.agentignore`** — user-editable, created by `init`
5. **CLI `--ignore` flag** — runtime additions

All layers are merged into a single `ignore` instance that checks every file path during traversal.

## Explain Command

The only feature that touches the network. It clusters your graph by community, sends each cluster to Groq's API for LLM-generated architectural summaries, and writes the results to `semantic-summary.md`.

**Rate limiting:** A token bucket algorithm ensures the request rate never exceeds the configured RPM (default 30). Each retry attempt also consumes a token, preventing retry storms.

**Concurrency:** Multiple LLM requests run in parallel (default 2, max 5). Each worker pulls from a shared index for race-free item assignment.

**Retry:** Failed requests (HTTP 429) trigger exponential backoff: 1s → 2s → 4s → 8s → 16s. Failed clusters are saved to `.explain-retry.json` for `--retry`.

**BYOK (Bring Your Own Key):** You provide your own Groq API key. No data ever reaches our servers. Credentials are stored in `~/.codebase-vis/config.json`.

## Security Model

The tool operates in a logical sandbox:

- **Read-only observer** — all file reading is via `fs.promises.readFile()`. No `eval()`, no `require()`, no `vm.runInNewContext()` on user code.
- **Restricted writer** — `safeWriteFile()` verifies the resolved output path starts with `codebase-out/` before writing. Path traversal attempts are blocked.
- **Symlink rejection** — `fs.lstat()` skips symbolic links to prevent recursive traversal.
- **File size caps** — files > 2MB are silently skipped.
- **No outbound network** — the CLI never makes HTTP requests (except the optional `explain` command and a once-per-hour npm update check).
