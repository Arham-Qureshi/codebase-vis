export function getHtmlTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>agent-context | Codebase Graph</title>
  
  <!-- Graphology for graph structure and parsing -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/graphology/0.25.4/graphology.umd.js"></script>
  
  <!-- Sigma.js for WebGL rendering -->
  <script src="https://cdn.jsdelivr.net/npm/sigma@2.4.0/build/sigma.min.js"></script>

  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f172a;
      overflow: hidden;
      font-family: sans-serif;
    }
    #sigma-container {
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="sigma-container"></div>

  <script>
    async function loadGraph() {
      try {
        const response = await fetch('./graph.json');
        if (!response.ok) {
          throw new Error('Failed to fetch graph.json');
        }
        
        const data = await response.json();
        
        // Initialize a multi-directed graph to match the builder's config
        const graph = new graphology.MultiDirectedGraph();
        graph.import(data);
        
        // Initialize Sigma renderer on the container
        const container = document.getElementById('sigma-container');
        const renderer = new Sigma(graph, container);
      } catch (err) {
        console.error('Error loading graph:', err);
      }
    }

    // Start
    loadGraph();
  </script>
</body>
</html>`;
}
