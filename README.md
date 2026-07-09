# agent-context

[![npm version](https://img.shields.io/npm/v/agent-context)](https://www.npmjs.com/package/agent-context)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/agent-context)](LICENSE)

A local CLI tool that parses codebases, builds dependency graphs from AST analysis, and outputs interactive architecture visualizations.

## Features

- **AST-based parsing** — extracts real dependency relationships using language grammars, not regex
- **Multi-language** — JavaScript, TypeScript, Python, C/C++, HTML, CSS
- **Interactive graph** — visualise your architecture in a browser with zoom, pan, and node inspection
- **Dependency queries** — look up what a file imports and what imports it
- **Shortest path tracing** — find the chain between any two nodes via bidirectional BFS
- **LLM-powered summaries** — cluster files with Louvain community detection and generate semantic explanations via Groq
- **Zero cloud dependencies** — everything runs locally; no data leaves your machine except when you opt into `explain`

## Prerequisites

- **Node.js >= 18**
- **C++ compiler toolchain** — required by tree-sitter to compile native parser modules on first install

  | Platform | Package |
  |----------|---------|
  | Linux | `build-essential` |
  | macOS | Xcode Command Line Tools (`xcode-select --install`) |
  | Windows | MSVC Build Tools or Visual Studio with "Desktop development with C++" |

## Install

```bash
npm install -g agent-context
```

Or run without installing:

```bash
npx agent-context <command>
```

## Quick Start

Generate a dependency graph from your project, then open the visualiser:

```bash
$ cd my-project
$ agent-context generate
✔ Setting up output directory
✔ Tech stack detected: Node.js
✔ Found 142 files
✔ Parsed 140 files successfully
✔ Graph built: 523 nodes, 1284 edges
✔ graph.json written to codebase-out/
✔ graph.html generated in codebase-out/

$ agent-context serve
✔ Server running at http://localhost:3000
```

Open `http://localhost:3000` in your browser. The visualiser shows your codebase as an interactive force-directed graph — hover nodes for details, drag to rearrange, zoom to explore.

## Commands

### `init`

Create a boilerplate `.agentignore` file with sensible defaults (`node_modules/`, `dist/`, `.git/`, etc.).

```bash
$ agent-context init
✔ .agentignore created successfully
```

Edit the file to exclude additional paths, then run `generate`.

### `generate [paths...]`

Parse source files and build the dependency graph. Accepts one or more directory paths; defaults to the current directory.

```bash
$ agent-context generate src/ --ignore tests --verbose
✔ Setting up output directory
✔ Tech stack detected: Node.js
✔ Found 142 files
✔ Parsed 140 files successfully
✖   src/legacy/deprecated.js
✖   src/vendor/old-lib.js
✔ Graph built: 523 nodes, 1284 edges
✔ graph.json written to codebase-out/
✔ graph.html generated in codebase-out/
```

Options:

| Flag | Description |
|------|-------------|
| `--ignore <paths>` | Comma-separated list of directories to skip (e.g. `--ignore tests,fixtures`) |
| `--no-clear` | Skip clearing the terminal before output |
| `--verbose` | Print paths of files that failed to parse |

### `serve`

Start a local HTTP server for the interactive graph visualiser.

```bash
$ agent-context serve
✔ Server running at http://localhost:3000
```

Options:

| Flag | Description |
|------|-------------|
| `-p, --port <number>` | Port to bind (default: `3000`) |

### `query <target>`

Look up a file's dependencies (what it imports) and dependents (what imports it). Target can be a file path or a partial name for interactive selection.

```bash
$ agent-context query src/api/handler.js
✔ Graph loaded: 523 nodes, 1284 edges

handler.js

────────────────────────────
  ↓ Dependencies (3)
────────────────────────────
  ● src/middleware/auth.js
  ● src/utils/response.js
  ◆ express

────────────────────────────
  ↑ Dependents (2)
────────────────────────────
  ● src/api/router.js
  ● src/index.js

  Legend: ● file · ◆ package · ◇ entity
```

### `path <source> <target>`

Find the shortest dependency path between two nodes using bidirectional BFS.

```bash
$ agent-context path src/api/handler.js src/utils/db.js
✔ Graph loaded: 523 nodes, 1284 edges

────────────────────────────
  Dependency Path (4 hops)
────────────────────────────

  ● src/api/handler.js
  │
  ▼
  ● src/middleware/auth.js
  │
  ▼
  ● src/config.js
  │
  ▼
  ● src/utils/db.js
```

### `explain`

Cluster files using Louvain community detection, then generate semantic summaries via the Groq API. Credentials are prompted on first run and cached in `~/.agent-context/config.json`.

```bash
$ agent-context explain
✔ Graph loaded: 523 nodes, 1284 edges
✔ Detected 12 clusters across 140 files
? Paste your Groq API Key: ****************************************
? Enter the model name: (openai/gpt-oss-120b)
✔ Credentials saved to ~/.agent-context/config.json
✔ All 12 clusters analyzed
✔ Semantic report written to codebase-out/semantic-summary.md
✔ graph.json enriched with semantic_summary attributes.
```

Options:

| Flag | Description |
|------|-------------|
| `--model <name>` | Override the LLM model (e.g. `llama-3.1-8b-instant`) |
| `--reset` | Clear saved API credentials |

Output:

- `codebase-out/semantic-summary.md` — per-cluster architectural descriptions
- `graph.json` is enriched with a `semantic_summary` attribute on each node

### `clean`

Delete the `codebase-out/` directory after confirmation.

```bash
$ agent-context clean
✔ Are you sure you want to delete the codebase-out/ directory? Yes
✔ codebase-out/ deleted successfully
```

## Output Files

All generated files live under `codebase-out/` in the working directory.

| File | Description |
|------|-------------|
| `graph.json` | Full dependency graph in [graphology](https://graphology.github.io/) JSON format |
| `graph.html` | Self-contained interactive visualiser (open in any browser) |
| `semantic-summary.md` | LLM-generated architectural report (created by `explain`) |

## Configuration: `.agentignore`

Created via `agent-context init`. Uses `.gitignore`-style patterns to exclude paths from parsing.

```
# agent-context ignore file
# Add paths below to exclude from parsing

node_modules/
dist/
build/
.git/
.next/
coverage/
.env
codebase-out/
```

## Supported Languages

| Language | File Extensions |
|----------|-----------------|
| JavaScript | `.js`, `.jsx` |
| TypeScript | `.ts`, `.tsx` |
| Python | `.py` |
| C / C++ | `.cpp`, `.h`, `.hpp` |
| HTML | `.html` |
| CSS | `.css` |

## Troubleshooting

**tree-sitter build fails on install**
Make sure a C++ compiler is installed (see [Prerequisites](#prerequisites)). On Windows, ensure MSVC is available — install "Desktop development with C++" via the Visual Studio Installer.

**Port already in use**
Pass a different port: `agent-context serve --port 4000`.

**"graph.json not found"**
Run `agent-context generate` first to create the graph data.

**No files found during generate**
Check your `.agentignore` file — you may be excluding the target directory. Use `--verbose` to see which files are being processed.

## License

ISC
