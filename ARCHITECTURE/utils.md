# Utils Architecture

Shared utility modules used across the CLI, parser, and graph layers.

## Module Overview

Four independent utility modules providing filesystem sandboxing, file discovery, incremental caching, and parallel worker pool management.

## File Reference

| File | Exports | Role |
|---|---|---|
| `src/utils/file-system.js` | `getOutDirPath()`, `createOutDir()`, `safeWriteFile()` | Sandboxed output directory management |
| `src/utils/traversal.js` | `discoverFiles()` | Recursive file walker with ignore filter, size cap, extension filter |
| `src/utils/cache.js` | `loadCache()`, `saveCache()`, `splitFilesByCache()`, `getStalePaths()`, `buildUpdatedCache()` | Incremental parse cache with mtime + size fingerprints |
| `src/utils/worker-pool.js` | `WorkerPool` class | Fork-based parallel worker pool with crash recovery |

## file-system.js

```mermaid
flowchart TD
    subgraph exports["Exported Functions"]
        GET["getOutDirPath()<br/>→ path.resolve(cwd, 'codebase-out')"]

        CREATE["createOutDir()<br/>→ fs.mkdir(outDir, { recursive: true })<br/>→ return outDir"]

        SAFE["safeWriteFile(targetPath, data)"]
    end

    subgraph sandbox["safeWriteFile(targetPath, data)"]
        RESOLVE["resolvedTarget = path.resolve(targetPath)"]
        ROOT["sandboxRoot = outDir + path.sep"]
        CHECK{"resolvedTarget.startsWith(sandboxRoot)?"}
        CHECK -->|no| BLOCK["throw Error<br/>[SECURITY] Write blocked<br/>path outside sandbox"]
        CHECK -->|yes| MKDIR["fs.mkdir(path.dirname(target),<br/>{ recursive: true })"]
        MKDIR --> WRITE["fs.writeFile(target, data, 'utf-8')"]
    end

    CREATE --> GET
    SAFE --> RESOLVE
```

### Constants

```mermaid
flowchart LR
    CONST["const OUT_DIR_NAME = 'codebase-out'"] --> GET["getOutDirPath()"]
    GET --> RESULT["/absolute/path/to/codebase-out"]
```

## traversal.js

```mermaid
flowchart TD
    START["discoverFiles(targetDir, ig)"] --> RESOLVE["targetDir = path.resolve(targetDir)"]

    RESOLVE --> WALK["walk(dir)"]

    subgraph walk["walk(dir) → { files[], ignoredCount }"]
        READDIR["fs.readdir(dir)"] --> ERROR_DIR{"error?"}
        ERROR_DIR -->|EACCES/other| SKIP_DIR["return empty<br/>(graceful skip)"]
        ERROR_DIR -->|success| ENTRIES["for each entry in dir"]

        ENTRIES --> LSTAT["fs.lstat(fullPath)"]
        LSTAT -->|error| SKIP_ENTRY["skip silently"]
        LSTAT -->|success| CHECK_SYMLINK{"isSymbolicLink?"}
        CHECK_SYMLINK -->|yes| SKIP_SYMLINK["skip"]
        CHECK_SYMLINK -->|no| REL["relPath = path.relative(targetDir, fullPath)"]

        REL --> IGNORED{"ig.ignores(relPath)?"}
        IGNORED -->|yes| COUNT_IGNORE["ignoredCount++<br/>skip"]
        IGNORED -->|no| IS_DIR{"isDirectory?"}
        IS_DIR -->|yes| RECURSE["push walk(subdir) promise<br/>batch at 32 concurrency"]
        IS_DIR -->|no| CHECK_SIZE{"stat.size > 2MB?"}
        CHECK_SIZE -->|yes| SKIP_BIG["skip"]
        CHECK_SIZE -->|no| CHECK_EXT{"KNOWN_EXTENSIONS.has(ext)?"}
        CHECK_EXT -->|yes| PUSH["files.push(resolvedPath)"]
        CHECK_EXT -->|no| SKIP_EXT["skip"]
    end

    WALK --> AWAIT["await Promise.all(subdirPromises)"]

    AWAIT --> AGG["aggregate all files + ignoredCount"]

    AGG --> RETURN["return { files[], ignoredCount }"]
```

### Ignore Flow

```mermaid
flowchart LR
    subgraph sources["Ignore Pattern Sources"]
        HARD["HARDCODED_IGNORES<br/>(.git, codebase-out, node_modules, ...)"]
        STACK["STACK_IGNORES<br/>(depends on detected tech stack)"]
        NONCODE["NON_CODE_PATTERNS<br/>(*.md, *.json, *.png, fonts, ...)"]
        AGENT["readAgentignore()<br/>(user-editable .agentignore)"]
        CLI["--ignore flag<br/>(comma-separated)"]
    end

    subgraph ignore["ignore() instance"]
        IG["ignore().add([<br/>  ...HARDCODED,<br/>  ...STACK,<br/>  ...NONCODE,<br/>  ...AGENT,<br/>  ...CLI<br/>])"]
    end

    HARD --> IG
    STACK --> IG
    NONCODE --> IG
    AGENT --> IG
    CLI --> IG

    IG --> CHECK{"ig.ignores(relPath)?"}
    CHECK -->|true| SKIP["skip entry"]
    CHECK -->|false| PROCESS["process file/dir"]
```

### File Size and Extension Filters

```mermaid
flowchart LR
    FILE["file entry"] --> SIZE{"stat.size > 2MB?"}
    SIZE -->|yes| SKIP1["skip"]
    SIZE -->|no| EXT{"KNOWN_EXTENSIONS.has(ext)?"}
    EXT -->|yes| ACCEPT["files.push(resolvedPath)"]
    EXT -->|no| SKIP2["skip"]

    subgraph known["KNOWN_EXTENSIONS"]
        EXTS[".js .jsx .ts .tsx .py .cpp .h .hpp<br/>.html .css .rs .go .java"]
    end

    EXT --> known
```

## cache.js

```mermaid
flowchart TD
    subgraph exports["Exported Functions"]
        LC["loadCache(outDir)"]
        SVC["saveCache(outDir, files)"]
        SPLIT["splitFilesByCache(discoveredFiles, cache)"]
        STALE["getStalePaths(cache, discoveredSet)"]
        BUC["buildUpdatedCache(oldCache, toParse,<br/>parsedResults, stalePaths)"]
    end

    subgraph format["Cache File Format (.cache.json)"]
        VER["version: 1"]
        FILES_MAP["files: {<br/>  '/abs/path/file.js': {<br/>    mtime: 1700000000,<br/>    size: 1234,<br/>    data: { id, dependencies, entities }<br/>  }<br/>}"]
    end

    LC --> READ["fs.readFile(outDir/.cache.json)"]
    READ --> PARSE["JSON.parse"]
    PARSE --> VER_CHECK{"version === 1?"}
    VER_CHECK -->|yes| RETURN_MAP["return cache.files"]
    VER_CHECK -->|no| NULL["return null"]
    READ -->|error| NULL

    SVC --> WRITE["fs.writeFile({ version: 1, files })"]
```

### splitFilesByCache

```mermaid
flowchart TD
    START["splitFilesByCache(discoveredFiles, cache)"] --> PER_FILE["for each file path"]

    PER_FILE --> CACHED{"cache[path] exists?"}
    CACHED -->|no| TOPARSE["add to toParse[]"]
    CACHED -->|yes| STAT["fs.stat(path) → { mtimeMs, size }"]

    STAT --> MATCH{"mtimeMs === cached.mtime<br/>AND size === cached.size<br/>AND cached.data exists?"}
    MATCH -->|yes| RESTORE["add cached.data to<br/>cachedResults[]"]
    MATCH -->|no| TOPARSE

    STAT -->|ENOENT| TOPARSE

    TOPARSE --> RETURN["return { toParse[], cachedResults[] }"]
    RESTORE --> RETURN
```

### buildUpdatedCache

```mermaid
flowchart TD
    START["buildUpdatedCache(oldCache, toParse,<br/>parsedResults, stalePaths)"] --> COPY["updated = { ...oldCache }"]

    COPY --> DELETE["for each stalePath:<br/>delete updated[stalePath]"]

    DELETE --> PER_RESULT["for each parsedResult"]

    PER_RESULT --> HAS_ID{"result.id exists AND !result.error?"}
    HAS_ID -->|no| SKIP_P["skip"]
    HAS_ID -->|yes| STAT2["fs.stat(result.id)"]
    STAT2 --> STAT_OK{"stat succeeds?"}
    STAT_OK -->|yes| STORE["updated[id] = {<br/>  mtime: stat.mtimeMs,<br/>  size: stat.size,<br/>  data: result<br/>}"]
    STAT_OK -->|no| DELETE_ENTRY["delete updated[id]"]
```

### Cache Lifecycle

```mermaid
sequenceDiagram
    participant G as generateCommand
    participant C as cache.js
    participant F as filesystem

    G->>C: loadCache(outDir)
    C->>F: read .cache.json
    F-->>C: data or null
    C-->>G: files map or null

    G->>G: discoverFiles()
    G->>C: splitFilesByCache(files, cache)
    C-->>G: { toParse[], cachedResults[] }

    Note over G: toParse → worker pool<br/>cachedResults → reused directly

    G->>C: buildUpdatedCache(oldCache, toParse, results, stalePaths)

    C->>F: for each result: fs.stat()
    F-->>C: mtime + size
    C-->>G: updated cache object

    G->>C: saveCache(outDir, updated)
    C->>F: write .cache.json
```

## worker-pool.js

```mermaid
flowchart TD
    subgraph class["class WorkerPool"]
        CONSTRUCTOR["constructor(size, workerURL)"]
        ADD_WORKER["#addWorker()"]
        RUN["run(task) → Promise"]
        DRAIN["#drain()"]
        TERMINATE["terminate()"]
    end

    subgraph state["Private Fields"]
        WORKERS["#workers[] — all processes"]
        FREE["#free[] — idle workers"]
        QUEUE["#queue[] — pending tasks"]
        ACTIVE["#activeCount"]
        PENDING["#pending Map<br/>{ worker → { resolve, reject } }"]
    end

    CONSTRUCTOR --> INIT["for i = 0 to size:<br/>#addWorker()"]

    ADD_WORKER --> FORK["child_process.fork(workerPath)"]
    FORK --> REGISTER["worker.on('exit', replace)<br/>worker.on('error', replace)"]
    REGISTER --> TRACK["#workers.push(worker)<br/>#free.push(worker)"]

    RUN --> ENQUEUE["#queue.push({ task, resolve, reject })"]
    ENQUEUE --> DRAIN

    DRAIN --> LOOP{"#free.length > 0<br/>AND #queue.length > 0?"}

    LOOP -->|yes| POP["worker = #free.pop()<br/>{ task, resolve, reject } = #queue.shift()"]

    POP --> INCREMENT["#activeCount++"]

    INCREMENT --> ON_MESSAGE["setup onMessage handler"]

    ON_MESSAGE --> STORE["#pending.set(worker, { resolve, reject })"]
    STORE --> SEND["worker.send(task)"]

    SEND --> AWAIT_RESULT["wait for worker response<br/>or crash signal"]

    AWAIT_RESULT -->|message received| ON_MSG["onMessage handler:"]
    ON_MSG --> CLEANUP["#pending.delete(worker)<br/>worker.removeListener(...)"]
    CLEANUP --> DECREMENT["#activeCount--<br/>#free.push(worker)"]
    DECREMENT --> RESOLVE["resolve(result)"]
    RESOLVE --> DRAIN

    AWAIT_RESULT -->|exit code ≠ 0| REPLACE["replace():"]
    REPLACE --> REJECT["#pending.get(worker)<br/>→ reject(err)"]
    REJECT --> REMOVE["remove worker from<br/>#workers + #free"]
    REMOVE --> SPAWN_NEW["#addWorker()"]
    SPAWN_NEW --> DRAIN

    AWAIT_RESULT -->|error event| REPLACE

    TERMINATE --> KILL["for each worker:<br/>worker.kill('SIGTERM')"]
    KILL --> CLEAR["clear all arrays + maps<br/>activeCount = 0"]
```

### Worker → Parent IPC

```mermaid
sequenceDiagram
    participant P as Parent (index.js)
    participant W as Worker (parse-worker.js)

    Note over P: WorkerPool constructor
    P->>W: fork(parse-worker.js)

    Note over P: pool.run(filePath)
    P->>W: worker.send(filePath)

    Note over W: parse file using tree-sitter
    W-->>P: process.send({ id, dependencies, entities })

    Note over P: onMessage handler:
    Note over P: resolve(result)

    Note over W: crash
    W-->>P: exit code ≠ 0
    Note over P: replace():
    Note over P: reject pending promise
    P->>W: fork(replacement) ← new worker
```

### Worker Lifecycle

```mermaid
flowchart LR
    subgraph startup["Startup"]
        FORK["child_process.fork()"]
        REG["register exit + error handlers"]
        PUSH["add to #workers + #free"]
    end

    subgraph busy["Processing"]
        POP_FREE["pop from #free"]
        SEND_TASK["worker.send(task)"]
        WAIT["wait for message"]
    end

    subgraph done["Completion"]
        MSG["message received"]
        RESOLVE_P["resolve promise"]
        PUSH_FREE["push back to #free"]
        DRAIN_Q["#drain()"]
    end

    subgraph crash["Crash Recovery"]
        EXIT["exit code ≠ 0"]
        REJECT_P["reject pending promise"]
        REPLACE_FN["remove + fork replacement"]
        DRAIN_Q2["#drain()"]
    end

    startup --> busy
    busy --> done
    busy --> crash
    done --> busy
    crash --> busy
```

## Error Handling Summary

| Module | Error | Behavior |
|---|---|---|
| `file-system.js` | Path outside sandbox | Throws `[SECURITY]` error — blocked |
| `file-system.js` | `mkdir` failure | Bubble up (unhandled) |
| `file-system.js` | `writeFile` failure | Bubble up |
| `traversal.js` | `readdir` failure | Directory silently skipped |
| `traversal.js` | `lstat` failure | Entry silently skipped |
| `traversal.js` | File > 2MB | Silently skipped |
| `traversal.js` | Unknown extension | Silently skipped |
| `cache.js` | Cache file missing | Return `null` |
| `cache.js` | Version mismatch | Return `null` (full re-parse) |
| `cache.js` | `stat` failure per file | File queued for re-parse / entry deleted |
| `worker-pool.js` | Worker exit ≠ 0 | Auto-replacement, pending promise rejected |
| `worker-pool.js` | Worker error event | Auto-replacement, pending promise rejected |
| `worker-pool.js` | Queue empty / no free workers | Busy-wait via `#drain()` loop |

## Dependency Graph

```mermaid
flowchart LR
    subgraph used_by["Used By"]
        GEN["generate.js"]
        DET["detect.js"]
        QRY["query.js"]
        PATH["path.js"]
        EXP["explain.js"]
        CLEAN["clean.js"]
        SERVE["serve.js"]
    end

    subgraph utils["Utils"]
        FS["file-system.js"]
        TR["traversal.js"]
        CA["cache.js"]
        WP["worker-pool.js"]
    end

    GEN --> FS
    GEN --> TR
    GEN --> CA
    GEN --> WP

    DET --> FS
    QRY --> FS
    PATH --> FS
    EXP --> FS
    CLEAN --> FS
    SERVE --> FS
```
