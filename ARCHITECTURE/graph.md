# Graph Architecture

Builds a directed multi-graph from parsed file data, enriches it with community detection and colors, detects circular dependencies, and exports to JSON.

## Module Overview

The graph layer takes the parsed output from the parser module and constructs a `graphology` `Graph` instance. Three phases run sequentially:

1. **`buildGraph()`** — Adds file nodes, entity sub-nodes, external package nodes, and dependency edges.
2. **`enrichNodes()`** — Runs Louvain community detection on the file-only subgraph, names communities by dominant directory, assigns colors, sets visual attributes.
3. **`exportGraphToJson()`** — Serializes to `graph.json` via sandboxed write.

Cycle detection (`detectCycles()`) is a separate offline analysis that runs on-demand via the `detect` CLI command.

## File Reference

| File | Exports | Role |
|---|---|---|
| `src/graph/builder.js` | `buildGraph()` | Main entry: parses parsed data into Graphology graph |
| `src/graph/enricher.js` | `enrichNodes()`, `findCommonRoot()` | Louvain communities, naming, colors, visual layout attrs |
| `src/graph/formatter.js` | `exportGraphToJson()` | Serializes graph to `graph.json` |
| `src/graph/cycle-detector.js` | `detectCycles()`, `enrichCycles()` | DFS-based cycle detection with canonical dedup |

## Overall Pipeline

```mermaid
flowchart LR
    subgraph INPUT["Parser Output"]
        PD["parsedData[]<br/>{ id, dependencies[], entities{} }"]
    end

    subgraph BUILD["builder.js"]
        BG["buildGraph(parsedData)"]
        LD["loadPackageDeps()<br/>← package.json"]
    end

    subgraph ENRICH["enricher.js"]
        EN["enrichNodes(graph)"]
        LC["Louvain community<br/>detection"]
        NC["nameCommunities()"]
        CA["color assignment"]
        VA["visual attributes<br/>(size, position, label, language)"]
    end

    subgraph EXPORT["formatter.js"]
        EG["exportGraphToJson(graph, outDir)"]
        GJ["graph.json"]
    end

    subgraph CYCLE["cycle-detector.js<br/>(on-demand via detect)"]
        DC["detectCycles(graph)"]
        EC["enrichCycles(graph, cycles)"]
        CJ["cycles.json"]
    end

    PD --> BG
    BG --> EN
    LD --> BG
    EN --> LC --> NC --> CA --> VA
    VA --> EG --> GJ
    GJ --> DC --> EC --> CJ
```

## buildGraph()

```mermaid
flowchart TD
    START["buildGraph(parsedData)"] --> PKG["loadPackageDeps()<br/>read package.json → Set<depName>"]

    START --> GRAPH["new Graph({ multi: true, directed: true })"]

    GRAPH --> PASS1["Phase 1: Add nodes"]

    PASS1 --> FILE_NODE["for each parsedData entry:<br/>graph.addNode(data.id, { dependencies })"]

    FILE_NODE --> ENTITY{"entities is<br/>Array or Object?"}

    ENTITY -->|Object| STRUCT["structured entities"]

    STRUCT --> CLASSES["for each class:<br/>addNode(id::ClassName, { kind: 'class' })<br/>addEdge(file→entity, { relation: 'contains' })"]

    STRUCT --> FUNCTIONS["for each function:<br/>addNode(id::FnName, { kind: 'function' })<br/>addEdge(file→entity, { relation: 'contains' })"]

    STRUCT --> METHODS["for each method:<br/>addNode(id::MethodName, { kind: 'method' })<br/>addEdge(file→entity, { relation: 'contains' })"]

    STRUCT --> DOCSTRINGS["store docstrings on file node<br/>graph.setNodeAttribute(id, 'docstrings', [...])"]

    ENTITY -->|Array| FLAT["backward compat: flat list"]

    FLAT --> OLD_ENT["for each entity name:<br/>addNode(id::Name, { kind: 'entity' })<br/>addEdge(file→entity, { relation: 'contains' })"]

    CLASSES --> PASS2
    FUNCTIONS --> PASS2
    METHODS --> PASS2
    DOCSTRINGS --> PASS2
    OLD_ENT --> PASS2

    PASS2["Phase 2: Add dependency edges"]

    PASS2 --> RESOLVE["for each parsedData entry:"]

    RESOLVE --> DEP["for each dependency string:"]

    DEP --> RELATIVE{"starts with ./ or ../?"}
    RELATIVE -->|yes| REL_RES["target = path.resolve(dirname, dep)"]
    RELATIVE -->|no| TRY_LOCAL["target = path.resolve(dirname, dep)<br/>graph.hasNode(target)?"]
    TRY_LOCAL -->|yes| REL_RES
    TRY_LOCAL -->|no| EXTERNAL["external package:"]

    REL_RES --> EDGE{"graph.hasNode(target)?"}
    EDGE -->|yes| IMPORTS["graph.addEdge(id → target,<br/>{ relationship: 'imports' })"]
    EDGE -->|no| SKIP["skip (file not in project)"]

    EXTERNAL --> MERGE["graph.mergeNode(dep, { external: true, label, npm })"]
    MERGE --> IMPORTS_EXT["graph.addEdge(id → dep,<br/>{ relationship: 'imports' })"]

    IMPORTS --> ENRICH["enrichNodes(graph)"]
    IMPORTS_EXT --> ENRICH
    SKIP --> ENRICH

    ENRICH --> RETURN["return graph"]
```

### Node Types

| Type | Example | Attributes | Created By |
|---|---|---|---|
| **File** | `/src/app.js` | `{ dependencies, docstrings? }` | `addNode(data.id, ...)` |
| **Entity (structured)** | `/src/app.js::App` | `{ label: 'App', kind: 'class' }` | `classes`, `functions`, `methods` loops |
| **Entity (flat)** | `/src/app.js::utils` | `{ label: 'utils', kind: 'entity' }` | Backward-compat flat list |
| **External** | `express` | `{ external: true, label: 'express', npm: true }` | Bare import resolution |

### Edge Types

| Relation | From | To | Style in Visualization |
|---|---|---|---|
| `contains` (dashed) | File | Entity | Dashed line, entity color |
| `imports` (solid) | File | File | Solid line, source node's community color |
| `imports` (solid) | File | External | Solid line, external color |

### Dependency Resolution

```mermaid
flowchart LR
    DEP["dependency string"] --> REL{"starts with<br/>./ or ../ ?"}
    REL -->|yes| LOCAL["path.resolve(dirname, dep)"]
    REL -->|no| CHECK["path.resolve(dirname, dep)"]
    CHECK --> EXISTS{"graph.hasNode<br/>(candidate)?"}
    EXISTS -->|yes| LOCAL
    EXISTS -->|no| EXTERNAL["bare import →<br/>mergeNode as external"]
    LOCAL --> HAS{"graph.hasNode<br/>(resolved)?"}
    HAS -->|yes| EDGE["addEdge(id → target)"]
    HAS -->|no| SKIP["file not in project"]
```

## enrichNodes()

```mermaid
flowchart TD
    START["enrichNodes(graph)"] --> COLLECT["collect file nodes<br/>(not external, not entity)"]

    COLLECT --> COMMON_ROOT["findCommonRoot(fileDirs)<br/>→ deepest common ancestor path"]

    COMMON_ROOT --> SUBGRAPH["build undirected subgraph<br/>of file→file edges only"]

    SUBGRAPH --> LOUVAIN["louvain(subgraph)<br/>→ { nodeId: communityInt }"]

    LOUVAIN --> GROUP["group file nodes by<br/>community ID"]

    GROUP --> NAME["nameCommunities()"]

    subgraph naming["nameCommunities(communityFileMap, commonRoot)"]
        N1["for each community:<br/>count files per relative directory"]
        N2["pick directory with<br/>most files"]
        N3["disambiguate duplicates<br/>→ 'dir #1', 'dir #2'"]
    end

    NAME --> naming

    naming --> COLORS["assign per-community color<br/>from 12-color PALETTE"]

    COLORS --> APPLY["apply attributes to every node"]

    APPLY --> FILE_ATTRS["File nodes"]

    FILE_ATTRS --> F1["size = clamp(degree, 5, 15)"]
    F1 --> F2["x, y = Math.random() × 100"]
    F2 --> F3["label = attrs.label || basename"]
    F3 --> F4["community = Louvain name"]
    F4 --> F5["color = palette[communityIdx]"]
    F5 --> F6["language = EXT_TO_LANGUAGE[ext]"]

    APPLY --> EXT_ATTRS["External nodes"]

    EXT_ATTRS --> E1["community = 'dependencies'"]
    E1 --> E2["color = #2d6a4f (green)"]

    EXT_ATTRS --> ENT_ATTRS["Entity nodes"]

    ENT_ATTRS --> ENT1["size = 3 (smaller)"]
    ENT1 --> ENT2["color = #6a2d6a (purple)"]
    ENT2 --> ENT3["community = parent file's community<br/>(lookup by id:: prefix → parentFile)"]

    ENT_ATTRS --> DONE["graph is mutated in-place<br/>(returns nothing)"]
```

### Louvain Community Detection

```mermaid
flowchart LR
    subgraph directed["Directed Multi-Graph (graphology)"]
        N1["file A<br/>──imports──→ file B"]
        N2["file B<br/>──imports──→ file C"]
        N3["file C<br/>──imports──→ file A"]
    end

    subgraph undirected["Undirected Subgraph (for Louvain)"]
        UN1["file A ── file B"]
        UN2["file B ── file C"]
        UN3["file C ── file A"]
    end

    subgraph result["Louvain Output"]
        R1["{ a: 0, b: 0, c: 0 }<br/>(all in same community)"]
    end

    directed -->|"graph.forEachEdge<br/>if fileSet.has(source) &&<br/>fileSet.has(target)"| undirected
    undirected -->|"louvain(subgraph)"| result
```

### Community Naming Example

```mermaid
flowchart TD
    FILES["Community 0 files:<br/>/project/src/utils/parse.js<br/>/project/src/utils/format.js<br/>/project/src/utils/validate.js<br/><br/>Community 1 files:<br/>/project/src/components/Button.tsx<br/>/project/src/components/Input.tsx<br/><br/>Community 2 files:<br/>/project/src/utils/api.js"]

    COUNT["for each community:<br/>count files per relative directory"]

    C0["Community 0:<br/>src/utils → 3 files<br/>. → 0 files"]
    C1["Community 1:<br/>src/components → 2 files"]
    C2["Community 2:<br/>src/utils → 1 file"]

    DISAMBIG["duplicate 'src/utils' detected"]

    RESULT["Community 0 → 'src/utils #1'<br/>Community 1 → 'src/components'<br/>Community 2 → 'src/utils #2'"]

    FILES --> COUNT --> C0 & C1 & C2
    C0 & C2 --> DISAMBIG
    DISAMBIG --> RESULT
    C1 --> RESULT
```

## cycle-detector

```mermaid
flowchart TD
    START["detectCycles(graph)"] --> FILTER["collect file nodes<br/>(isFileNode = !external && !entity)"]

    FILTER --> FILESET["fileSet = new Set(fileNodes)<br/>visited = new Set()<br/>pathStack = []<br/>stackSet = new Set()<br/>cycles = new Map()"]

    FILESET --> DFS["for each file node:<br/>if not visited → dfs(node)"]

    DFS --> ENTER["dfs(node)"]

    ENTER --> MARK["visited.add(node)<br/>pathStack.push(node)<br/>stackSet.add(node)"]

    MARK --> NEIGHBORS["graph.forEachOutNeighbor(node)"]

    NEIGHBORS --> FILTER_NEIGHBOR{"fileSet.has(neighbor)?"}
    FILTER_NEIGHBOR -->|no| NEXT_NEIGHBOR["skip (entity or external)"]
    FILTER_NEIGHBOR -->|yes| CAP{"cycles.size >= 200?"}
    CAP -->|yes| STOP["stop exploring"]
    CAP -->|no| BACKEDGE{"stackSet.has(neighbor)?"}

    BACKEDGE -->|yes| CYCLE_FOUND["back-edge detected"]

    CYCLE_FOUND --> SLICE["idx = pathStack.indexOf(neighbor)<br/>cyclePath = pathStack.slice(idx)"]

    SLICE --> CANON["canonicalKey(cyclePath)"]

    CANON --> DEDUP{"cycles.has(key)?"}
    DEDUP -->|no| STORE["cycles.set(key,<br/>[...cyclePath, neighbor])"]
    DEDUP -->|yes| NEXT_NEIGHBOR

    BACKEDGE -->|no| VISITED{"visited.has(neighbor)?"}
    VISITED -->|no| DFS_CHILD["dfs(neighbor)"]
    VISITED -->|yes| NEXT_NEIGHBOR

    NEXT_NEIGHBOR --> POP["pathStack.pop()<br/>stackSet.delete(node)"]

    POP --> RETURN["return to caller"]

    STORE --> NEXT_NEIGHBOR
    DFS_CHILD --> NEXT_NEIGHBOR
    STOP --> POP

    FILTER --> DONE["return Array.from(cycles.values())<br/>→ string[][]"]
```

### Canonical Key Deduplication

Without dedup, a 3-node cycle `A→B→C→A` would be detected from three different entry points:
- `[A, B, C, A]` (entered at A)
- `[B, C, A, B]` (entered at B)
- `[C, A, B, C]` (entered at C)

```mermaid
flowchart LR
    CYCLE1["[B, C, A, B]"] --> ROT1["find min element index<br/>B is first (idx=0)"]
    ROT1 --> KEY1["rotated: B|C|A|B<br/>→ key: 'B|C|A|B'"]

    CYCLE2["[C, A, B, C]"] --> ROT2["find min element index<br/>A is first (idx=1)"]
    ROT2 --> KEY2["rotated: A|B|C|A<br/>→ key: 'A|B|C|A'"]

    CYCLE3["[A, B, C, A]"] --> ROT3["find min element index<br/>A is first (idx=0)"]
    ROT3 --> KEY3["rotated: A|B|C|A<br/>→ key: 'A|B|C|A'"]

    KEY1 & KEY2 & KEY3 --> MAP{"Map<string, string[]>"}
    MAP -->|key collision| UNIQUE["only one entry stored<br/>→ 1 unique cycle"]
```

### `enrichCycles()`

```mermaid
flowchart LR
    RAW["raw cycles<br/>string[][]"] --> MAP_CYCLES["for each cycle array:"]

    MAP_CYCLES --> FILES["files = cycle.map(id → { id, label })"]
    MAP_CYCLES --> EDGES["edges = adjacency pairs<br/>[0→1, 1→2, ..., n→0]"]

    FILES --> ENRICHED["enriched cycles<br/>{ id, size, files, edges, label }"]
    EDGES --> ENRICHED

    ENRICHED --> WRITE["write cycles.json<br/>{ id, size, files[], edges[], label }"]
```

## formatter

```mermaid
flowchart LR
    GRAPH["Graphology Graph<br/>(with community, color,<br/>language, size attrs)"] --> EXPORT["graph.export()<br/>→ JSON-compatible object"]

    EXPORT --> STRINGIFY["JSON.stringify(data, null, 2)"]

    STRINGIFY --> SAFE["safeWriteFile(targetPath, json)<br/>→ sandbox check:<br/>path.startsWith(codebase-out/)"]

    SAFE --> GJ["graph.json"]
```

The `graph.export()` call serializes the entire graphology graph into the standard graphology JSON format, which includes all nodes with their attributes, all edges with their attributes, and graph options (`type: mixed`, `multi: true`, `allowSelfLoops: true`).

## Attribute Summary

After enrichment, every node has these attributes:

| Attribute | Type | Source | Example |
|---|---|---|---|
| `label` | string | `basename(node)` or `attrs.label` | `app.js` |
| `size` | number | `clamp(degree, 5, 15)` for files; `3` for entities | `8` |
| `x`, `y` | number | `Math.random() × 100` (ForceAtlas2 rearranges in browser) | `42.7` |
| `color` | string | Palette index for files, `#2d6a4f` for externals, `#6a2d6a` for entities | `#4E79A7` |
| `community` | string | Louvain community name | `src/utils` |
| `language` | string | `EXT_TO_LANGUAGE[ext]` | `JavaScript` |
| `external` | boolean | External packages only | `true` |
| `kind` | string | Entity nodes only: `class`, `function`, `method`, `entity` | `class` |
| `npm` | boolean | External packages only: listed in `package.json` | `true` |
| `dependencies` | string[] | File nodes only | `['./utils.js']` |
| `docstrings` | string[] | File nodes only (if extracted) | `['/** ... */']` |
