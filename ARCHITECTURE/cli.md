# CLI Architecture

The CLI entry point and all terminal commands for `codebase-vis`.

## Module Overview

All CLI code lives in two locations:

- **`bin/codebase-vis.js`** — Single entry point registered in `package.json` as `"bin": { "codebase-vis": "bin/codebase-vis.js" }`. Uses `commander` for argument parsing, subcommand dispatch, and help formatting.
- **`src/cli/`** — Eight command modules plus shared utilities. Each command is an async function that follows a consistent pattern: `intro()` → spinner(s) → `outro()`.

Every command uses `@clack/prompts` for spinners, confirmations, and text/password prompts, and `picocolors` for terminal coloring.

## File Reference

| File | Exports | Role |
|---|---|---|
| `bin/codebase-vis.js` | — (runnable) | Commander setup, 8 command registrations, pre/post hooks, update checker |
| `src/cli/commands/index.js` | `initCommand`, `generateCommand`, `cleanCommand`, `serveCommand`, `queryCommand`, `pathCommand`, `explainCommand`, `detectCommand` | Barrel re-export |
| `src/cli/commands/init.js` | `initCommand` | Creates `.agentignore` with tech-stack-aware defaults |
| `src/cli/commands/generate.js` | `generateCommand` | File discovery → cache split → worker pool parse → graph build → export |
| `src/cli/commands/clean.js` | `cleanCommand` | Deletes `codebase-out/` with user confirmation |
| `src/cli/commands/serve.js` | `serveCommand` | Static HTTP server for `codebase-out/` |
| `src/cli/commands/query.js` | `queryCommand` | Inspects a single node's dependencies + dependents |
| `src/cli/commands/path.js` | `pathCommand` | Bidirectional BFS shortest path between two nodes |
| `src/cli/commands/detect.js` | `detectCommand` | Cycle detection, writes `cycles.json` |
| `src/cli/commands/explain.js` | `explainCommand` | LLM-powered semantic summaries (Groq API) |
| `src/cli/shared.js` | `loadGraph`, `resolveNode`, `formatNodeLabel`, `toRelative`, `resetTimer` | Shared graph loading + node resolution utilities |

## Top-Level Dispatch

```mermaid
flowchart TD
    ENV["#!/usr/bin/env node"] --> PROG["new Command()<br/>name: codebase-vis<br/>version: from package.json"]

    PROG --> CFG["configureHelp()<br/>Custom help formatter<br/>with inline flags + examples"]

    CFG --> CMD1["command('init')"]
    CFG --> CMD2["command('generate [paths...]')"]
    CFG --> CMD3["command('clean')"]
    CFG --> CMD4["command('serve')"]
    CFG --> CMD5["command('query <target>')"]
    CFG --> CMD6["command('path <source> <target>')"]
    CFG --> CMD7["command('explain')"]
    CFG --> CMD8["command('detect')"]

    CMD1 --> H1["preAction hook:<br/>record start time"]
    CMD2 --> H1
    CMD3 --> H1
    CMD4 --> H1
    CMD5 --> H1
    CMD6 --> H1
    CMD7 --> H1
    CMD8 --> H1

    H1 --> ACTION["command handler runs<br/>(async function)"]
    ACTION --> H2["postAction hook:<br/>print elapsed time<br/>checkForUpdate()"]

    H2 --> EXIT["program.parse(process.argv)"]

    subgraph update["Update Checker"]
        CACHE["Read ~/.codebase-vis/update-check.json"] --> FRESH{"cached < 1 hour old?"}
        FRESH -->|yes| SKIP["use cached version"]
        FRESH -->|no| FETCH["fetch registry.npmjs.org<br/>/codebase-vis/latest"]
        FETCH --> COMPARE{"latest > current?"}
        COMPARE -->|yes| WARN["print yellow upgrade notice"]
        COMPARE -->|no| DONE["silent"]
        SKIP --> DONE
    end

    H2 --> update
```

## Per-Command Diagrams

### `init` command

```mermaid
flowchart TD
    START["initCommand()"] --> CHECK{"fs.access<br/>.agentignore exists?"}
    CHECK -->|yes| WARN["warn 'already exists'<br/>return"]
    CHECK -->|no| DETECT["spinner: detectTechStack()"]
    DETECT --> BUILD["build ignore lines array"]

    subgraph lines["Ignore Lines"]
        L1["Common ignores<br/>(.git, codebase-out, .env)"]
        L2["Non-code patterns<br/>(*.md, *.json, images, fonts)"]
        L3["Config dirs<br/>(.agents/, .opencode/)"]
        L4["Stack-specific ignores<br/>(node_modules/, venv/, target/)"]
        L5["Custom section header"]
    end

    BUILD --> lines
    lines --> WRITE["spinner: write .agentignore"]
    WRITE --> NOTE["print review note"]
    NOTE --> OUTRO["outro: edit → generate"]
```

### `generate` command

```mermaid
flowchart TD
    START["generateCommand(paths[], options)"] --> RESOLVE["resolve target directories<br/>paths → absolute, or cwd"]
    RESOLVE --> SPIN1["spinner: createOutDir()"]
    SPIN1 --> SPIN2["spinner: detectTechStack()"]
    SPIN2 --> SPIN3["spinner: readAgentignore()"]

    SPIN3 --> IGNORE["build ignore instance<br/>ignore().add([hardcoded + stack<br/>+ non-code + agentignore + cli])"]

    IGNORE --> DISCOVER["spinner: discoverFiles(dirs, ig)"]
    DISCOVER --> FILES{"files found?"}

    FILES --> CACHE["spinner: loadCache(outDir)"]
    CACHE --> SPLIT{"cache exists?"}

    SPLIT -->|yes| SPLIT2["splitFilesByCache()"]
    SPLIT2 --> TOPARSE["toParse[] = files not cached<br/>cachedResults[] = from cache<br/>stalePaths[] = removed"]

    SPLIT -->|no| TOPARSE2["toParse = all files<br/>cachedResults = empty"]

    TOPARSE --> PARSE{"toParse > 0?"}
    TOPARSE2 --> PARSE

    PARSE -->|yes| WORKER["spinner: parseFileBatch()"]
    WORKER --> POOL["Worker Pool<br/>(CPU - 1 forks)"]
    POOL --> RESULTS["freshResults[]"]

    PARSE -->|no| MERGE

    RESULTS --> MERGE["merge allParsed =<br/>cachedResults + freshResults"]
    MERGE --> BUILD["spinner: buildGraph(allParsed)"]

    BUILD --> GRAPH_OBJ["Graphology Graph<br/>(multi, directed)"]
    GRAPH_OBJ --> EXPORT["spinner: exportGraphToJson()"]
    EXPORT --> GJ["graph.json"]

    GRAPH_OBJ --> HTML["spinner: getHtmlTemplate()<br/>safeWriteFile()"]
    HTML --> GH["graph.html"]

    GRAPH_OBJ --> CACHE_SAVE["spinner: buildUpdatedCache()<br/>saveCache()"]

    CACHE_SAVE --> OUTRO["outro: generate complete"]
```

### `clean` command

```mermaid
flowchart TD
    START["cleanCommand()"] --> CONFIRM["confirm: delete codebase-out/?"]
    CONFIRM --> CANCEL{"cancelled?"}
    CANCEL -->|yes| CANCEL_OUT["outro: clean cancelled"]
    CANCEL -->|no| ACCESS["fs.access(outDir)"]
    ACCESS --> EXISTS{"exists?"}
    EXISTS -->|no| GONE["warn: does not exist<br/>outro: clean skipped"]
    EXISTS -->|yes| RM["spinner: fs.rm(outDir,<br/>{ recursive: true, force: true })"]
    RM --> DONE_OUT["outro: clean complete"]
```

### `serve` command

```mermaid
flowchart TD
    START["serveCommand(options)"] --> PORT["parse port<br/>(options.port || 3000)"]
    PORT --> ACCESS["fs.access(outDir)"]
    ACCESS --> EXISTS{"codebase-out exists?"}
    EXISTS -->|no| ERR["error: run 'generate' first<br/>return"]
    EXISTS -->|yes| CREATE["http.createServer()"]

    CREATE --> ROUTE["route / → graph.html<br/>other → static file"]

    ROUTE --> MIME["mime type map<br/>.html .json .js .css"]

    MIME --> LISTEN["server.listen(port)"]

    LISTEN --> PRINT["print: Server running at<br/>http://localhost:{port}"]

    PRINT --> OPEN["spawn browser open:<br/>darwin → open<br/>win32 → start<br/>linux → xdg-open"]

    LISTEN --> ERR_HANDLE["server.on('error')"]
    ERR_HANDLE --> EADDR{"EADDRINUSE?"}
    EADDR -->|yes| PORT_ERR["error: port in use,<br/>try --port <number>"]
    EADDR -->|no| GEN_ERR["error: server error"]
```

### `query` command

```mermaid
flowchart TD
    START["queryCommand(target)"] --> LOAD["spinner: loadGraph()"]
    LOAD --> GRAPH_OK{"graph loaded?"}
    GRAPH_OK -->|no| ERR["error: run 'generate' first<br/>return"]
    GRAPH_OK -->|yes| RESOLVE["resolveNode(graph, target)"]

    RESOLVE --> MATCH{"result type?"}
    MATCH -->|undefined| CANCEL["outro: cancelled"]
    MATCH -->|null| NOT_FOUND["error: no node matched"]
    MATCH -->|string| NODE_ID["resolved node ID"]

    NODE_ID --> GET_ATTRS["graph.getNodeAttributes()"]
    GET_ATTRS --> HEADER["print: label + path + community"]

    HEADER --> DEPS["collect outNeighbors<br/>(dependencies)"]
    DEPS --> DEPS_IN["collect inNeighbors<br/>(dependents)"]

    DEPS_IN --> DEDUP["deduplicate multi-graph edges<br/>(Set of IDs)"]

    DEDUP --> PRINT["print sections with icons"]

    subgraph icons["Icon Legend"]
        FILE["● file = pc.cyan()"]
        PKG["◆ package = pc.yellow()"]
        ENT["◇ entity = pc.magenta()"]
    end

    PRINT --> icons
    icons --> OUTRO["outro: query complete"]
```

### `path` command

```mermaid
flowchart TD
    START["pathCommand(source, target)"] --> LOAD["spinner: loadGraph()"]
    LOAD --> GRAPH_OK{"graph loaded?"}
    GRAPH_OK -->|no| ERR["error: return"]
    GRAPH_OK -->|yes| SRC["resolveNode(graph, source)"]
    SRC --> TGT["resolveNode(graph, target)"]

    TGT --> BOTH_OK{"both resolved?"}
    BOTH_OK -->|no| CANCEL_OUT["cancelled or not found"]
    BOTH_OK -->|yes| BFS["spinner: bidirectionalBFS()"]

    BFS --> FW["Forward frontier<br/>source → outNeighbors"]

    BFS --> BW["Backward frontier<br/>target ← inNeighbors"]

    FW --> EXPAND{"expand smaller frontier"}
    BW --> EXPAND

    EXPAND --> MEET{"frontiers meet?"}
    MEET -->|no| LOOP["continue until empty"]
    LOOP --> EXPAND
    MEET -->|yes| BUILD["buildPath()"]

    MEET -->|frontiers exhausted| NULL["return null"]

    BUILD --> PATH["reconstruct path from<br/>fwdParent + bwdParent maps"]

    NULL --> NO_PATH["warn: no path exists"]

    PATH --> PRINT["print chain with<br/>│ ▼ arrows"]
    NO_PATH --> OUTRO2
    PRINT --> OUTRO2["outro: path trace complete"]
```

### `detect` command

```mermaid
flowchart TD
    START["detectCommand()"] --> LOAD["spinner: loadGraph()"]
    LOAD --> GRAPH_OK{"graph loaded?"}
    GRAPH_OK -->|no| ERR["error: run 'generate' first"]
    GRAPH_OK -->|yes| DETECT["spinner: detectCycles(graph)"]

    DETECT --> DFS["DFS on file nodes only<br/>(skips entities + externals)"]
    DFS --> CANON["canonicalKey() → string-based<br/>rotation for dedup"]
    CANON --> CAP["capped at 200 cycles"]

    CAP --> RAW["raw cycle paths<br/>(string[][])"]

    RAW --> ENRICH["spinner: enrichCycles(graph, cycles)"]
    ENRICH --> META["add id, size, files, edges, label"]

    META --> WRITE["write cycles.json<br/>to codebase-out/"]

    WRITE --> EMPTY{"cycles found?"}
    EMPTY -->|no| SUCCESS["success: no cycles detected"]
    EMPTY -->|yes| PRINT["for each cycle:<br/>Cycle #N (M files)<br/>file → file → file chain"]

    PRINT --> TIP["tip: open graph.html<br/>→ Show Cycles"]
    SUCCESS --> OUTRO
    TIP --> OUTRO["outro: detection complete"]
```

### `explain` command

```mermaid
flowchart TD
    START["explainCommand(options)"] --> RETRY{"--retry flag?"}
    RETRY -->|yes| RETRY_FLOW["read .explain-retry.json<br/>→ resolveCredentials()<br/>→ loadGraph()<br/>→ retry each failed cluster"]
    RETRY -->|no| NORMAL["resolveCredentials()"]

    NORMAL --> CREDS{"creds obtained?"}
    CREDS -->|no| CANCEL["p.cancel(), return"]
    CREDS -->|yes| LOAD["spinner: loadGraph()"]
    LOAD --> GRAPH_OK{"graph loaded?"}
    GRAPH_OK -->|no| ERR["error: return"]
    GRAPH_OK -->|yes| CLUSTER["spinner: clusterGraph(graph)"]

    CLUSTER --> GROUP["group file nodes by<br/>attrs.community"]
    GROUP --> BATCH["split into batches of ≤8"]

    BATCH --> CONFIG["resolveConcurrency(opt)<br/>→ cap at 5<br/>TokenBucket(rpm)"]

    CONFIG --> SPINNER["spinner with progress<br/>mapConcurrent()"]

    SPINNER --> WORKERS["N concurrent workers<br/>(default 2, max 5)"]

    WORKERS --> PLD["extractPayload(graph, batch)<br/>→ { file, classes, functions,<br/>docstrings, edges }"]

    PLD --> LLM["callLLMWithRetry(apiKey,<br/>model, payload, bucket)"]

    LLM --> BUCKET["TokenBucket.acquire()"]
    BUCKET --> RETRY_LLM["POST api.groq.com<br/>/openai/v1/chat/completions"]

    RETRY_LLM --> OK{"success?"}
    OK -->|yes| STORE["set semantic_summary<br/>on each node in batch"]
    OK -->|429| BACKOFF["exponential backoff<br/>1s → 2s → 4s → 8s → 16s"]
    BACKOFF --> RETRY_LLM
    OK -->|other error| FAIL["push to failedClusters[]"]

    STORE --> DONE_BATCH["worker completes"]
    FAIL --> DONE_BATCH

    DONE_BATCH --> ALL_DONE{"all batches done?"}
    ALL_DONE -->|no| CONTINUE["next batch"]
    CONTINUE --> WORKERS
    ALL_DONE -->|yes| EXPORT["export graph → graph.json<br/>(with semantic_summary attrs)"]

    EXPORT --> WRITE_MD["write semantic-summary.md<br/>→ cluster sections"]

    WRITE_MD --> FAIL_HANDLE{"failures?"}
    FAIL_HANDLE -->|yes| RETRY_FILE["write .explain-retry.json<br/>print retry hint"]
    FAIL_HANDLE -->|no| SUCCESS_TIP["print paths + tip"]
    RETRY_FILE --> OUTRO
    SUCCESS_TIP --> OUTRO["outro: explain complete"]
```

## Shared Utilities

```mermaid
flowchart LR
    subgraph shared["src/cli/shared.js"]
        LG["loadGraph()"] --> CHECK["fs.access(graph.json)"]
        CHECK -->|exists| READ["fs.readFile → JSON.parse"]
        READ --> GRAPH["new Graph({ multi, directed })<br/>graph.import(data)"]

        RN["resolveNode(graph, target)"] --> EXACT{"graph.hasNode(target)?"}
        EXACT -->|yes| RETURN["return target"]
        EXACT -->|no| ABS{"graph.hasNode(resolved)?"}
        ABS -->|yes| RETURN2["return resolved"]
        ABS -->|no| FUZZY["lowercase partial match<br/>over all nodes"]
        FUZZY --> COUNT{"matches?"}
        COUNT -->|0| NULL["return null"]
        COUNT -->|1| RETURN3["return match.id"]
        COUNT -->|2+| SELECT["p.select() interactive<br/>(cap 25 options)"]
        SELECT --> CANCEL2{"cancelled?"}
        CANCEL2 -->|yes| UNDEFINED["return undefined"]
        CANCEL2 -->|no| RETURN4["return selected.id"]

        FN["formatNodeLabel(id, attrs)"] --> EXT{"attrs.external?"}
        EXT -->|yes| YELLOW["pc.yellow(id)"]
        EXT -->|no| KIND{"attrs.kind?"}
        KIND -->|class| GREEN["pc.green(label)"]
        KIND -->|function/entity| MAGENTA["pc.magenta(label)"]
        KIND -->|other| CYAN["pc.cyan(toRelative(id))"]

        TR["toRelative(nodeId)"] --> REL["path.relative(cwd, nodeId)"]
    end

    subgraph consumers["Used By"]
        Q["query.js"]
        P["path.js"]
        D["detect.js"]
        E["explain.js"]
    end

    shared --> consumers
```

### `callLLMWithRetry` / `TokenBucket` (explain.js)

```mermaid
flowchart TD
    SUB["callLLMWithRetry(apiKey, model, payload, bucket)"] --> ACQUIRE["bucket.acquire()"]

    ACQUIRE --> REFILL["TokenBucket#refill()<br/>elapsed / refillInterval → new tokens"]
    REFILL --> TOKENS{"tokens > 0?"}
    TOKENS -->|no| SLEEP["await setTimeout(refillInterval)"]
    SLEEP --> REFILL
    TOKENS -->|yes| CONSUME["tokens--<br/>return"]

    ACQUIRE --> CALL["callLLM(apiKey, model, payload)"]

    CALL --> POST["POST api.groq.com<br/>Authorization: Bearer ${key}<br/>temperature: 0.3, max_tokens: 1024"]

    POST --> STATUS{"response status"}
    STATUS -->|200| PARSE["data.choices[0].message.content"]
    STATUS -->|429| RETRY{"attempt < 4?"}
    RETRY -->|yes| DELAY["delay = min(1000 × 2^attempt, 32s)"]
    DELAY --> WAIT["await setTimeout(delay)"]
    WAIT --> ACQUIRE
    RETRY -->|no| THROW["throw error"]
    STATUS -->|other| THROW["throw error"]
```

## Error Handling Patterns

| Command | Graceful Early Return | Per-Item Resilience | Catch-all |
|---|---|---|---|
| `init` | `.agentignore` exists → warn, return | — | Uncaught → Node crash |
| `generate` | — | Parse errors per-file (stored, not thrown); `--verbose` shows details | Uncaught → Node crash |
| `clean` | `confirm` cancelled → return; `outDir` missing → warn, return | — | Uncaught → Node crash |
| `serve` | `codebase-out/` missing → error, return | — | Server `error` event (EADDRINUSE handled) |
| `query` | `loadGraph()` null → error, return; `resolveNode()` null/cancel → return | — | Uncaught → Node crash |
| `path` | Same as `query` | — | Uncaught → Node crash |
| `detect` | `loadGraph()` null → error, return | — | Top-level try/catch → stop spinner, print message |
| `explain` | `loadGraph()` null → return; credentials cancelled → return; 0 clusters → warn | Per-cluster LLM failures → write `retry.json`, continue | Uncaught → Node crash |

**Observations:**
- `detect` is the only command with a top-level try/catch wrapping its entire logic.
- `explain` has the most resilient error handling (retry file, per-cluster catch, credential management).
- Most commands rely on Node's default unhandled-rejection behavior for unexpected errors.
- The `checkForUpdate()` function swallows all errors silently (network/disk failures are non-fatal).
