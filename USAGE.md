# Usage

A visual guide to `codebase-vis` commands and their output, using the `codebase-vis` codebase itself as the example project.

## Commands

list of commands and flags
![commands and flag](usage/commands.png)

### `init`

```bash
codebase-vis init
```

![init output](usage/init.png)

### `generate`

```bash
codebase-vis generate
```

![generate output](usage/generate.png)

### `serve`

```bash
codebase-vis serve
```

Open `http://localhost:3000` in your browser to explore the interactive graph.

![serve output](usage/serve.png)

### `query`

```bash
codebase-vis query src/cli/commands/generate.js
```

![query output](usage/query.png)

### `path`

```bash
codebase-vis path src/graph/builder.js src/graph/enricher.js
```

![path output](usage/path.png)

### `explain`

```bash
codebase-vis explain
```

![explain output](usage/explain.png)

### `clean`

```bash
codebase-vis clean
```

![clean output](usage/clean.png)

### `graph.json`

The full dependency graph in graphology JSON format. Contains all nodes, edges, and attributes.

```json
{
  "nodes": [
    {
      "key": "src/bin/codebase-vis.js",
      "attributes": {
        "label": "codebase-vis.js",
        "language": "JavaScript",
        "community": "bin",
        "dependencies": ["commander", "src/cli/commands/index.js", ...]
      }
    }
  ],
  "edges": [
    { "source": "src/bin/codebase-vis.js", "target": "commander" },
    { "source": "src/bin/codebase-vis.js", "target": "src/cli/commands/index.js" }
  ]
}
```
