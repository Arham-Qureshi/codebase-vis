# Changelog

## [1.6.0] — 2026-07-24

### Added

#### `codebase-vis stat` command

A new CLI command that analyzes the generated dependency graph and prints aggregate or per-target statistics directly in the terminal.

Supports two modes: **global** (no target) for codebase-wide metrics, and **target** (`codebase-vis stat <target>`) for per-node analysis.

**Source files:**
- `src/cli/commands/stat.js` (578 lines) — CLI orchestration, rendering logic (column/vertical layout), user-facing output with `@clack/prompts` and `picocolors`
- `src/utils/stat-calculator.js` (366 lines) — pure computation: `computeGlobalStats()`, `computeTargetStats()`, language breakdown, hotspot ranking, health metrics, directory breakdown, cross-module coupling
- `test/cli/stat.test.js` (427 lines) — comprehensive tests covering empty graph, composition, language aggregation, hotspot ranking with topN, maxDepChain, cross-module edges, isolated files, cycle cross-referencing, file/entity/external target stats, verbose mode, directory breakdown

---

##### Global mode: `codebase-vis stat`

Runs aggregate analysis across the entire dependency graph. Output is structured into sections:

**Composition**
Counts of every node and edge type in the graph:
- Source file nodes, entity nodes (with breakdown: classes, functions, methods)
- External packages (with npm sub-count), directories
- Dependency edges, contains edges
- Cross-module edges count and percentage (edges that cross Louvain community boundaries)

**Languages**
Per-language table sorted by file count descending. Each row shows:
- Language name
- File count
- Total dependencies (outbound edges to other files)
- Entity count (classes + functions + methods within that language)

After the language table, a directory breakdown shows how many files live in each directory (sorted by count descending).

**Health**
Codebase health indicators:
- **Avg Deps/File** — total dependency edges divided by file count (decimal)
- **Entity Density** — total entities divided by file count (2 decimal places)
- **Max Dep Chain** — longest chain of file-to-file dependencies, computed via BFS starting from root files (zero in-degree nodes)
- **Isolated Files** — files with zero outbound deps and zero inbound dependents
- **Circular Deps** — number of cycles detected (reads `cycles.json` if it exists; shows `null` if not)

**Hotspots**
Three ranked lists of notable files (controlled by `--top <N>` or `--all`):
- **Most Imported** — files with the most inbound dependency edges (highest dependents), ranked descending
- **Heaviest Importers** — files with the most outbound dependency edges, ranked descending
- **Largest (by entities)** — files containing the most entity nodes (classes/functions/methods), ranked descending

---

##### Target mode: `codebase-vis stat <target>`

Analyzes a single node identified by fuzzy name matching. Output adapts based on node type:

**File nodes** (`type: file`): language, community (Louvain module), degree (in/out/total), number of files it depends on, number of files that depend on it, entity breakdown (classes, functions, methods, total), cycle membership (which cycle IDs), isolated status

**Entity nodes** (`type: entity`): kind (class/function/method), parent file, language (inherited from parent), community (inherited), degree (in/out/total), cycle membership

**External package nodes** (`type: external`): npm flag, community, number of files that import it, cycle membership

---

##### Flags

| Flag | Description |
|------|-------------|
| `--json` | Output statistics as structured JSON to stdout instead of terminal rendering. All computed fields are included verbatim. |
| `--top <number>` | Limit hotspot lists to the top N entries (default: 5). Combined with `--all` to show every entry. |
| `--all` | Show all hotspots with no limit (overrides `--top`). |
| `--verbose` | Include isolated file paths in global stats health section; include entity name/kind list in file target stats. |
| `--out <path>` | Write JSON output to a file instead of stdout (only works with `--json`). Creates parent directories if needed. |

`--json` output includes the same data as terminal mode but in a structured format suitable for programmatic consumption by other tools or scripts.

---

##### Rendering logic

The terminal output adapts to terminal width:
- **Wide terminals** (≥85 columns): two-column layout — Composition side-by-side with Languages, Hotspots and Health below
- **Narrow terminals** (<85 columns): single vertical layout with section headers and `─` separators for readability

Column widths are computed proportionally using configurable weights. Padding and ANSI-aware string alignment ensure visual alignment even with colored output. Both modes include a color legend at the bottom.

---

### Changed

#### Template refactoring: monolithic `graph.html` → modular `frame.html` + `style.css` + `script.js`

**Before:** `src/templates/graph.html` was a single 413-line file containing inline CSS (`<style>`) and inline JavaScript (`<script>`) embedded in the HTML. Any change — whether CSS, JS, or HTML — required editing the same file, producing noisy diffs and breaking editor tooling (no syntax highlighting, no linting for the inline CSS/JS).

**After:** The template is split into three files in `src/templates/graph/`:

- **`frame.html`** (83 lines) — HTML skeleton with two placeholder comments: `<!-- CSS -->` and `<!-- SCRIPT -->`. Contains the loading spinner SVG, graph container, sidebar with search/info/filters/cycles/legend sections, and the minimap canvas.

- **`style.css`** (505 lines) — All visual styles extracted as a standalone CSS file. Font import (Inter), loading overlay with animated spinner (node-pulse + edge-pulse keyframes), glassmorphism sidebar with backdrop-filter, search/info/filters/legend sections, cycles section styling, minimap styling with hidden/visible states, scrollbar customization.

- **`script.js`** — All JavaScript logic extracted as a standalone file. vis-network boot sequence, ForceAtlas2 physics with stabilization freeze, node/edge DataSet creation, click-to-inspect sidebar, fuzzy search with pan-to-node, community legend toggles, dependency/entity filters, cycles overlay with red edge highlighting and dimmed non-cycle nodes, minimap setup with canvas rendering and drag-to-navigate, M key toggle, hover edge bolding.

**Assembly:** `getHtmlTemplate()` in `src/templates/graph-template.js` reads all three files in parallel via `Promise.all`, then injects CSS into `<!-- CSS -->` and JS into `<!-- SCRIPT -->` using `String.replace()`. The assembled HTML is cached after first build.

**Files changed:**
- `src/templates/graph-template.js` — updated from single `readFile` to `Promise.all` with string replacement
- `src/templates/graph.html` — deleted (renamed to `src/templates/graph/script.js` with similarity 53%)
- `src/templates/graph/frame.html` — created
- `src/templates/graph/style.css` — created
- `src/templates/graph/script.js` — created

#### Ignore system: `.agentignore` as single source of truth

Removed three hardcoded ignore mechanisms from `src/cli/commands/generate.js`:

- **`HARDCODED_IGNORES`** — static list of 15 entries (`.git`, `node_modules`, `LICENSE`, `README.md`, etc.)
- **`STACK_IGNORES`** — 20-entry map of framework-specific ignores (e.g., Python → `__pycache__`, Rust → `target`)
- **`NON_CODE_PATTERNS`** — 20 glob patterns for non-code file extensions (`.txt`, `.md`, `.json`, images, etc.)

**Why:** Hardcoded lists could silently override or conflict with the user's `.agentignore` file. Dual sources of truth made the ignore behavior unpredictable — a user who added a path to `.agentignore` might find it overridden by `HARDCODED_IGNORES`.

**How it works now:** The ignore instance is built exclusively from `.agentignore` patterns and CLI `--ignore` flags: `ignore().add([...agentignorePatterns, ...cliIgnores])`. The `buildIgnoreInstance()` wrapper was removed entirely. This makes ignore behavior fully deterministic — what you write in `.agentignore` is what you get.

#### Other changes

- `package.json` version bumped to `1.6.0`, homepage redirect to GitHub Wiki
- `bin/codebase-vis.js` — stat command registered with all flags, custom `formatHelp()` with stat in commands and examples
- `src/cli/commands/index.js` — added `statCommand` export
- `README.md` — stat added to quick reference table, commands section
- `CONTRIBUTING.md` — project structure updated to reflect modular template, stat files
- `package-lock.json` — trailing newline fix

### Removed

- `src/templates/graph.html` — monolithic template (replaced by `graph/frame.html` + `style.css` + `script.js`)
- `HARDCODED_IGNORES`, `STACK_IGNORES`, `NON_CODE_PATTERNS` constants from `src/cli/commands/generate.js`
- `buildIgnoreInstance()` function from `src/cli/commands/generate.js`
- `CHANGELOG.md` (previous v1.4.0 content)