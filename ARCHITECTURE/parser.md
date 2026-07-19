# Parser Architecture

The parser module discovers source files, extracts dependencies and entities via tree-sitter AST queries, and returns structured data for graph construction.

## Module Overview

Three conceptual layers:

- **Orchestration** — `src/parser/index.js` + `src/parser/parse-worker.js` coordinate single-file and batch-parallel parsing via a `WorkerPool`.
- **Language Parsers** — One file per language (`javascript.js`, `typescript.js`, `python.js`, `cpp.js`, `html.js`, `css.js`, `go.js`, `java.js`, `rust.js`). Each exports a tree-sitter grammar, a dependency extractor, and an entity extractor.
- **Utilities** — File discovery (`traversal.js`), incremental cache (`cache.js`), worker pool management (`worker-pool.js`), language metadata (`languages.js`), and stack detection (`stack-detector.js`).

## File Reference

| File | Exports | Role |
|---|---|---|
| `src/parser/index.js` | `parseFile()`, `parseFileBatch()` | Orchestrator: single file and batch-parallel entry points |
| `src/parser/parse-worker.js` | — (child process) | Forked worker: receives file path via IPC, returns parsed result |
| `src/parser/javascript.js` | `grammar`, `extractDependencies()`, `extractEntities()` | JS/JSX parser |
| `src/parser/typescript.js` | `grammar`, `tsxGrammar`, `extractDependencies()`, `extractEntities()` | TS/TSX parser (shares JS dependency queries) |
| `src/parser/python.js` | `grammar`, `extractDependencies()`, `extractEntities()` | Python parser (method dedup by AST position) |
| `src/parser/cpp.js` | `grammar`, `extractDependencies()`, `extractEntities()` | C/C++ parser (system + string includes) |
| `src/parser/html.js` | `grammar`, `extractDependencies()`, `extractEntities()` | HTML parser (script src, link href, img src) |
| `src/parser/css.js` | `grammar`, `extractDependencies()`, `extractEntities()` | CSS parser (@import, url(), deduplicated) |
| `src/parser/go.js` | `grammar`, `extractDependencies()`, `extractEntities()` | Go parser (import_spec, type/function/method) |
| `src/parser/java.js` | `grammar`, `extractDependencies()`, `extractEntities()` | Java parser (import, class/interface, method/constructor) |
| `src/parser/rust.js` | `grammar`, `extractDependencies()`, `extractEntities()` | Rust parser (use, extern crate, struct/enum/trait/fn) |
| `src/parser/languages.js` | `LANGUAGES`, `EXT_TO_LANGUAGE`, `EXT_TO_PARSER`, `KNOWN_EXTENSIONS`, `STACK_MARKERS`, `detectLanguages()` | Language metadata + tech stack markers |
| `src/parser/stack-detector.js` | `detectTechStack()` | Framework detection from marker files |
| `src/utils/traversal.js` | `discoverFiles()` | Recursive file walker with ignore filter + size cap |
| `src/utils/worker-pool.js` | `WorkerPool` class | Fork-based worker pool with crash recovery |
| `src/utils/cache.js` | `loadCache()`, `saveCache()`, `splitFilesByCache()`, `getStalePaths()`, `buildUpdatedCache()` | Incremental parse cache (mtime + size fingerprints) |

## Architecture Layers

```mermaid
flowchart TD
    subgraph CLI["CLI Layer"]
        GEN["generateCommand()<br/>src/cli/commands/generate.js"]
        GEN --> PARSER
    end

    subgraph PARSER["Orchestration"]
        IDX["index.js<br/>parseFile()<br/>parseFileBatch()"]
        PW["parse-worker.js<br/>(forked child process)"]
        WP["WorkerPool<br/>src/utils/worker-pool.js"]
    end

    subgraph UTILS["Utilities"]
        TRAV["traversal.js<br/>discoverFiles()"]
        CACHE["cache.js<br/>loadCache / splitByCache"]
        LANG["languages.js<br/>GRAMMAR_MAP / STACK_MARKERS"]
        STACK["stack-detector.js<br/>detectTechStack()"]
    end

    subgraph PARSERS["Language Parsers"]
        JS["javascript.js"]
        TS["typescript.js"]
        PY["python.js"]
        CPP["cpp.js"]
        HTML["html.js"]
        CSS["css.js"]
        GO["go.js"]
        JAVA["java.js"]
        RUST["rust.js"]
    end

    CLI --> UTILS
    UTILS --> IDX
    IDX --> WP
    WP --> PW
    PW --> PARSERS
```

## File Discovery + Cache Flow

```mermaid
flowchart TD
    START["generateCommand()"] --> READIGNORE["readAgentignore()<br/>+ STACK_IGNORES<br/>+ CLI --ignore"]

    READIGNORE --> IG["ignore().add([...patterns])"]

    IG --> DISCOVER["discoverFiles(dirs, ig)"]

    subgraph discover["discoverFiles(targetDir, ig)"]
        WALK["walk(dir)"]
        WALK --> ENTRIES["fs.readdir(dir)"]
        ENTRIES --> FILTER{"for each entry:"}
        FILTER --> IGNORED{"ig.ignores(relPath)?"}
        IGNORED -->|yes| SKIP["ignoredCount++<br/>skip"]
        IGNORED -->|no| TYPE{"file or dir?"}
        TYPE -->|dir| RECURSE["walk(subdir)<br/>concurrency: 32"]
        TYPE -->|file| SIZE{"size ≤ 2MB<br/>AND known extension?"}
        SIZE -->|yes| PUSH["files.push(resolvedPath)"]
        SIZE -->|no| SKIP2["skip silently"]
    end

    DISCOVER --> FILES["{ files[], ignoredCount }"]

    FILES --> LOAD_CACHE["loadCache(outDir)"]

    LOAD_CACHE --> CACHE_EXISTS{"cache.version === 1?"}
    CACHE_EXISTS -->|no| ALL_FRESH["toParse = all files<br/>cachedResults = []"]
    CACHE_EXISTS -->|yes| SPLIT["splitFilesByCache(files, cache)"]

    SPLIT --> PER_FILE["for each file:"]
    PER_FILE --> MATCH{"mtimeMs === cached<br/>&& size === cached<br/>&& data exists?"}
    MATCH -->|yes| CACHED["cachedResults.push(data)"]
    MATCH -->|no| TOPARSE["toParse.push(file)"]

    CACHED --> STALE["getStalePaths(cache, files)"]
    STALE --> PRUNE["files deleted since<br/>last run → remove from cache"]

    ALL_FRESH --> PARSE
    TOPARSE --> PARSE["parseFileBatch(toParse)"]
```

## Single-File Parse Flow

```mermaid
flowchart LR
    subgraph worker["parse-worker.js"]
        RECV["process.on('message')"] --> EXT["path.extname(filePath)"]
        EXT --> GRAMMAR_LOOKUP["GRAMMAR_MAP[ext]"]
        GRAMMAR_LOOKUP --> PARSER_CACHE["parserCache.get(ext)<br/>or new Parser() + setLanguage()"]
        PARSER_CACHE --> READ["fs.readFile(filePath, 'utf8')"]
        READ --> EMPTY{"content empty?"}
        EMPTY -->|yes| NULL["return null"]
        EMPTY -->|no| PARSE["parser.parse(content)<br/>→ CST rootNode"]
        PARSE --> DEPS["config.extractDeps(rootNode, grammar)<br/>→ string[]"]
        DEPS --> ENTS["config.extractEnts(rootNode, grammar)<br/>→ { classes, functions, methods, docstrings }"]
        ENTS --> RESULT["process.send({ id, dependencies, entities })"]
    end

    subgraph parent["index.js"]
        SEND["pool.run(filePath)"] --> IPC["child.send(filePath)"]
        IPC --> RECV
        RESULT --> PARENT_RECV["worker.on('message')"]
        PARENT_RECV --> DONE["resolve(result)"]
    end
```

## Batch/Parallel Parse (Worker Pool)

```mermaid
flowchart TD
    START["parseFileBatch(files, onProgress, jobs)"] --> NW["numWorkers = jobs<br/>|| os.cpus().length - 1<br/>|| 1"]

    NW --> POOL["new WorkerPool(numWorkers, workerURL)"]

    POOL --> SPAWN["#addWorker() × numWorkers"]

    SPAWN --> FORK["child_process.fork(workerPath)"]
    FORK --> REG_EVENTS["worker.on('exit', replace)<br/>worker.on('error', replace)"]
    REG_EVENTS --> PUSH["push to #workers + #free"]

    POOL --> MAP["map files → pool.run(file)"]

    MAP --> ENQUEUE["for each file:<br/>#queue.push({ task, resolve, reject })"]

    ENQUEUE --> DRAIN["#drain()"]

    DRAIN --> WHILE{"#free > 0 && #queue > 0"}
    WHILE -->|yes| POP["pop free worker<br/>shift queued task"]

    POP --> SEND["worker.send(task)"]
    SEND --> SETUP["#pending.set(worker, { resolve, reject })<br/>worker.on('message', onMessage)"]

    SETUP --> AWAIT["wait for message<br/>or crash"]

    AWAIT --> MSG{"message or crash?"}
    MSG -->|message| RESOLVE["onMessage:<br/>resolve(result)<br/>push worker back to #free<br/>#drain()"]
    MSG -->|exit code ≠ 0| CRASH["replace():<br/>reject pending promise<br/>remove worker<br/>#addWorker()<br/>#drain()"]
    MSG -->|error event| CRASH

    RESOLVE --> ALL_SETTLED["Promise.allSettled(promises)"]

    ALL_SETTLED --> ORDER["results[i] = result<br/>(order preserved by index)"]

    ORDER --> ERR_HANDLE["on error:<br/>results[i] = { id: file, error: true }"]

    ERR_HANDLE --> TERMINATE["pool.terminate()<br/>SIGTERM all workers"]

    TERMINATE --> PROGRESS["onProgress(files.length, files.length)"]

    PROGRESS --> RETURN["return results[]"]
```

## Language Parsers Detail

All parsers follow the same interface but differ in tree-sitter queries and entity extraction logic:

```mermaid
flowchart LR
    subgraph interface["Parser Interface"]
        GRAM["export const grammar<br/>= tree-sitter language"]
        EX_DEPS["export function extractDependencies(astRoot, grammar?)<br/>→ string[]"]
        EX_ENTS["export function extractEntities(astRoot, grammar?)<br/>→ { classes, functions, methods, docstrings }"]
    end

    subgraph deps["Dependency Queries"]
        JS_DEPS["JavaScript:<br/>import_statement<br/>require()<br/>import()"]
        TS_DEPS["TypeScript:<br/>(same as JS)"]
        PY_DEPS["Python:<br/>import_statement<br/>import_from_statement"]
        CPP_DEPS["C++:<br/>preproc_include"]
        HTML_DEPS["HTML:<br/>script[src]<br/>link[href], img[src]"]
        CSS_DEPS["CSS:<br/>@import<br/>url()"]
        GO_DEPS["Go:<br/>import_spec"]
        JAVA_DEPS["Java:<br/>import_declaration"]
        RUST_DEPS["Rust:<br/>use_declaration<br/>extern_crate"]
    end

    subgraph ents["Entity Extraction"]
        JS_ENTS["classes + functions +<br/>arrow fns + methods +<br/>/** docstrings"]
        TS_ENTS["(same as JS)"]
        PY_ENTS["classes + functions<br/>method dedup by<br/>AST position"]
        CPP_ENTS["classes + functions +<br/>namespaces + methods<br/>method dedup by position"]
        HTML_ENTS["always empty"]
        CSS_ENTS["always empty"]
        GO_ENTS["structs/interfaces +<br/>functions + methods"]
        JAVA_ENTS["classes/interfaces +<br/>methods/constructors<br/>method dedup by position"]
        RUST_ENTS["struct/enum/trait +<br/>functions + impl<br/>⚠ returns flat array"]
    end
```

### GRAMMAR_MAP (index.js & parse-worker.js)

```mermaid
flowchart LR
    subgraph gm["GRAMMAR_MAP"]
        JS[".js → javascript.js"]
        JSX[".jsx → javascript.js"]
        TS[".ts → typescript.typescript"]
        TSX[".tsx → typescript.tsx"]
        PY[".py → python.js"]
        CPP[".cpp → cpp.js"]
        H[".h → cpp.js"]
        HPP[".hpp → cpp.js"]
        HTML[".html → html.js"]
        CSS[".css → css.js"]
        RS[".rs → rust.js"]
        GO[".go → go.js"]
        JAVA[".java → java.js"]
    end
```

### Shared Query Patterns

| Capture Technique | Description | Used By |
|---|---|---|
| `#eq?` predicate | Filter captures where a named node equals a specific string | JS `require`, CSS `url()` |
| `#match?` predicate | Regex match on captured text | HTML `tag_name` = `^(link\|img)$` |
| `@_name` (underscore) | Named capture used only for a predicate, excluded from results | JS `@_func_name`, CSS `@_fn` |
| `startIndex-endIndex` key | Deduplicate by AST byte position (not name) | Python, C++, Java method dedup |
| `stripQuotes()` | Remove surrounding `""` or `''` | Go dependencies, CSS string values |
| `slice(1, -1)` | Remove surrounding `<>` or `""` | C++ include paths |

## Stack Detection

```mermaid
flowchart TD
    START["detectTechStack(rootDir)"] --> CLEAR["clear fileCache"]

    START --> MARKERS["iterate STACK_MARKERS array<br/>(ordered by specificity)"]

    MARKERS --> NEXT["next marker entry<br/>{ marker, dep?, type }"]

    NEXT --> READ["readMarkerFile(rootDir, marker)"]
    READ --> CACHE_CHECK{"in fileCache?"}
    CACHE_CHECK -->|yes| RETURN_CACHED["return cached content"]
    CACHE_CHECK -->|no| FREAD["fs.readFile(fullPath, 'utf8')"]
    FREAD --> CACHE_IT["cache + return content"]
    FREAD -->|ENOENT| NULL_CACHE["cache null + return null"]

    READ --> FOUND{"file exists?"}
    FOUND -->|no| NEXT["try next marker"]
    FOUND -->|yes| DEP_CHECK{"dep specified?"}
    DEP_CHECK -->|no| MATCH["return { type }"]
    DEP_CHECK -->|yes| SEARCH{"which marker type?"}

    SEARCH -->|package.json| PARSE_JSON["JSON.parse → dependencies<br/>+ devDependencies"]
    PARSE_JSON --> HAS_DEP{"dep key found?"}
    HAS_DEP -->|yes| MATCH
    HAS_DEP -->|no| NEXT

    SEARCH -->|requirements.txt| LINE_CHECK["line-by-line:<br/>strip # comments<br/>extract package name<br/>compare to dep"]
    LINE_CHECK --> HAS_DEP2{"dep found?"}
    HAS_DEP2 -->|yes| MATCH
    HAS_DEP2 -->|no| NEXT

    MATCH --> DONE["return { type }"]
    NEXT --> EXHAUSTED{"all markers tried?"}
    EXHAUSTED -->|no| NEXT
    EXHAUSTED -->|yes| FALLBACK["return { type: 'node' }"]
```

### Detection Priority

The marker array is ordered by specificity. Framework-specific checks (Next.js, Angular, React) come before generic ones (Node.js, Python):

```
nextjs > angular > react > vue > svelte > express > fastify > hono > node
  > django > flask > fastapi > python (pyproject) > python (setup.py)
  > python (requirements.txt) > cpp > rust > go > php > ruby > java
```

## Worker Pool Lifecycle

```mermaid
sequenceDiagram
    participant M as Main Process
    participant P as Pool
    participant W1 as Worker 1
    participant W2 as Worker 2

    Note over P: constructor(2, workerURL)
    P->>W1: fork(workerPath)
    P->>W2: fork(workerPath)

    Note over M: run(taskA)
    M->>P: pool.run(taskA)
    P->>W1: worker.send(taskA)
    Note over W1: parse file
    W1-->>P: process.send(result)
    P-->>M: resolve(result)

    Note over M: run(taskB) + run(taskC)
    M->>P: pool.run(taskB)
    P->>W2: worker.send(taskB)
    M->>P: pool.run(taskC)
    Note over P: no free workers<br/>→ queue taskC

    W2-->>P: process.send(resultB)
    P-->>M: resolve(resultB)
    Note over P: worker 2 freed<br/>→ drain queue
    P->>W2: worker.send(taskC)

    Note over W1: process.exit(1)
    W1-->>P: exit code ≠ 0
    Note over P: replace():<br/>reject pending<br/>fork new worker
    P->>W1: fork(workerPath) [replacement]

    M->>P: pool.terminate()
    P->>W1: SIGTERM
    P->>W2: SIGTERM
```

## Error Handling

| Module | Error Mode | Behavior |
|---|---|---|
| `parseFile()` | Any exception | Returns `null` (caller handles) |
| `parseFileBatch()` | Worker crash | Rejects single promise, stores `{ id, error: true }`, spawns replacement worker |
| `parseFileBatch()` | Parse failure | Per-worker, stored in results array; `--verbose` shows details |
| `discoverFiles()` | `EACCES` on `readdir` | Silently skips directory |
| `discoverFiles()` | `lstat` failure | Silently skips entry |
| `WorkerPool` | Worker exit code ≠ 0 | Auto-replaces, rejects pending promise, drains queue |
| `WorkerPool` | Worker `error` event | Same as exit ≠ 0 |
| `loadCache()` | Missing/corrupt/version mismatch | Returns `null` (all files re-parsed) |
| `splitFilesByCache()` | `fs.stat` failure | File added to `toParse[]` (re-parsed) |
| `buildUpdatedCache()` | `fs.stat` failure | Cache entry deleted |
| `detectTechStack()` | File read error | Marker entry skipped (next priority tried) |
| `readAgentignore()` | File missing | Returns `[]` (no patterns added) |

## Outstanding Inconsistency

`src/parser/rust.js` `extractEntities()` returns a flat `string[]` while every other language returns `{ classes, functions, methods, docstrings }`. The orchestrators (`index.js`, `parse-worker.js`) pass the output through without normalizing, so consumers get different shapes depending on language.
