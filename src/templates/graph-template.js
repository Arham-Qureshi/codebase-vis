export function getHtmlTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>agent-context | Codebase Graph</title>

  <!-- Graphology core -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/graphology/0.25.4/graphology.umd.js"><\/script>
  <!-- Graphology standard library (includes ForceAtlas2, etc.) -->
  <script src="https://cdn.jsdelivr.net/npm/graphology-library@0.8.0/dist/graphology-library.min.js"><\/script>
  <!-- Sigma.js for WebGL rendering -->
  <script src="https://cdn.jsdelivr.net/npm/sigma@2.4.0/build/sigma.min.js"><\/script>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #121212; /* Matte black */
      color: #e0e0e0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      height: 100vh;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    /* ── Sigma canvas ─────────────────────────────── */
    #sigma-container { 
      flex: 1; 
      position: relative;
      background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 0);
      background-size: 24px 24px;
    }

    /* ── Loading overlay ──────────────────────────── */
    #loading-overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: #0f172a; z-index: 100;
      transition: opacity 0.5s ease;
    }
    #loading-overlay.hidden { opacity: 0; pointer-events: none; }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid #1e293b;
      border-top-color: #4E79A7;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 14px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loading-overlay span {
      font-size: 13px; color: #94a3b8; letter-spacing: 0.03em;
    }

    #sidebar {
      width: 280px; 
      background: rgba(24, 24, 27, 0.85); /* Gloss black */
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; flex-direction: column; overflow: hidden;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
    }

    /* Search */
    #search-wrap { padding: 12px; border-bottom: 1px solid #2a2a4e; }
    #search {
      width: 100%; background: #0f0f1a;
      border: 1px solid #3a3a5e; color: #e0e0e0;
      padding: 7px 10px; border-radius: 6px;
      font-size: 13px; outline: none;
      font-family: inherit;
    }
    #search:focus { border-color: #4E79A7; }
    #search-results {
      max-height: 160px; overflow-y: auto;
      padding: 4px 12px; border-bottom: 1px solid #2a2a4e;
      display: none;
    }
    .search-item {
      padding: 5px 8px; cursor: pointer; border-radius: 4px;
      font-size: 12px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
      transition: background 0.15s;
    }
    .search-item:hover { background: #2a2a4e; }

    /* Node info */
    #info-panel { padding: 14px; border-bottom: 1px solid #2a2a4e; min-height: 130px; }
    #info-panel h3 {
      font-size: 11px; color: #64748b; margin-bottom: 10px;
      text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
    }
    #info-content { font-size: 13px; color: #cbd5e1; line-height: 1.7; }
    #info-content .field { margin-bottom: 3px; }
    #info-content .field b { color: #f1f5f9; font-weight: 500; }
    #info-content .empty { color: #475569; font-style: italic; font-size: 12px; }
    .neighbor-link {
      display: inline-block; padding: 2px 8px; margin: 2px 3px;
      border-radius: 10px; cursor: pointer;
      font-size: 11px; white-space: nowrap;
      background: #1e293b; color: #94a3b8;
      transition: background 0.15s, color 0.15s;
    }
    .neighbor-link:hover { background: #334155; color: #e2e8f0; }
    #neighbors-list { max-height: 120px; overflow-y: auto; margin-top: 6px; }

    #legend-wrap {
      flex: 1; overflow-y: auto; padding: 12px;
    }
    #legend-wrap h3 {
      font-size: 11px; color: #64748b; margin-bottom: 10px;
      text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
    }
    .legend-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 4px; cursor: pointer; border-radius: 4px;
      font-size: 12px; transition: background 0.15s;
    }
    .legend-item:hover { background: #2a2a4e; }
    .legend-item.dimmed { opacity: 0.3; }
    .legend-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    .legend-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e1; }
    .legend-count { color: #475569; font-size: 11px; font-weight: 500; }

    /* Stats bar */
    #stats {
      padding: 10px 14px; border-top: 1px solid #2a2a4e;
      font-size: 11px; color: #475569; letter-spacing: 0.02em;
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  </style>
</head>
<body>
  <div id="sigma-container">
    <div id="loading-overlay">
      <div class="spinner"></div>
      <span>Computing layout\u2026</span>
    </div>
  </div>

  <div id="sidebar">
    <div id="search-wrap">
      <input id="search" type="text" placeholder="Search nodes\u2026" autocomplete="off">
      <div id="search-results"></div>
    </div>
    <div id="info-panel">
      <h3>Node Info</h3>
      <div id="info-content"><span class="empty">Click a node to inspect</span></div>
    </div>
    <div id="legend-wrap">
      <h3>Modules</h3>
      <div id="legend"></div>
    </div>
    <div id="stats"></div>
  </div>

  <script>
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    async function boot() {
      const overlay = document.getElementById('loading-overlay');

      // 1. Fetch graph data
      const res = await fetch('./graph.json');
      if (!res.ok) throw new Error('Failed to load graph.json');
      const data = await res.json();

      // 2. Build graphology instance
      const graph = new graphology.MultiDirectedGraph();
      graph.import(data);

      // 3. Run ForceAtlas2 layout (synchronous, ~200 iterations)
      const fa2Settings = graphologyLibrary.layoutForceAtlas2.inferSettings(graph);
      graphologyLibrary.layoutForceAtlas2.assign(graph, {
        iterations: 200,
        settings: {
          ...fa2Settings,
          gravity: 0.05,
          scalingRatio: 10,
          strongGravityMode: false,
          adjustSizes: true,
          barnesHutOptimize: graph.order > 500,
        },
      });

      // 4. Set edge colors to inherit from source node
      graph.forEachEdge((edge, attrs, source) => {
        const sourceColor = graph.getNodeAttribute(source, 'color') || '#94a3b8';
        graph.setEdgeAttribute(edge, 'color', sourceColor);
      });

      // 5. Hover & highlight state (must be declared before Sigma constructor)
      let hoveredNode = null;
      let highlightedNeighbors = new Set();

      function nodeReducer(node, data) {
        const res = { ...data };
        if (hoveredNode) {
          if (node === hoveredNode) {
            res.highlighted = true;
            res.zIndex = 2;
            res.labelColor = '#000000'; // Make label black on hover
          } else if (highlightedNeighbors.has(node)) {
            res.zIndex = 1;
          } else {
            res.color = '#1e293b';
            res.label = '';
            res.zIndex = 0;
          }
        }
        return res;
      }

      function edgeReducer(edge, data) {
        const res = { ...data };
        if (hoveredNode) {
          const src = graph.source(edge);
          const tgt = graph.target(edge);
          if (src !== hoveredNode && tgt !== hoveredNode) {
            res.hidden = true;
          } else {
            res.size = 2;
          }
        }
        return res;
      }

      // 6. Build Sigma renderer
      const container = document.getElementById('sigma-container');
      const renderer = new Sigma(graph, container, {
        renderLabels: true,
        labelSize: 12,
        labelColor: { attribute: 'labelColor', color: '#e2e8f0' },
        labelFont: 'Inter, sans-serif',
        labelWeight: '500',
        labelRenderedSizeThreshold: 8,
        defaultEdgeColor: '#334155',
        defaultEdgeType: 'arrow',
        edgeLabelSize: 0,
        minCameraRatio: 0.08,
        maxCameraRatio: 10,
        defaultNodeColor: '#94a3b8',
        nodeReducer: nodeReducer,
        edgeReducer: edgeReducer,
      });

      // 6. Hide loading overlay
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 600);



      renderer.on('enterNode', ({ node }) => {
        hoveredNode = node;
        highlightedNeighbors = new Set(graph.neighbors(node));
        renderer.refresh();
        container.style.cursor = 'pointer';
      });

      renderer.on('leaveNode', () => {
        hoveredNode = null;
        highlightedNeighbors = new Set();
        renderer.refresh();
        container.style.cursor = 'default';
      });

      let draggedNode = null;
      let isDragging = false;

      renderer.on("downNode", (e) => {
        isDragging = true;
        draggedNode = e.node;
        renderer.getCamera().disable();
      });

      renderer.getMouseCaptor().on("mousemovebody", (e) => {
        if (!isDragging || !draggedNode) return;
        const pos = renderer.viewportToGraph(e);
        graph.setNodeAttribute(draggedNode, "x", pos.x);
        graph.setNodeAttribute(draggedNode, "y", pos.y);
        e.preventSigmaDefault();
        e.original.preventDefault();
        e.original.stopPropagation();
      });

      renderer.getMouseCaptor().on("mouseup", () => {
        if (draggedNode) {
          isDragging = false;
          draggedNode = null;
          renderer.getCamera().enable();
        }
      });

      renderer.on('clickNode', ({ node }) => {
        showInfo(graph, node);
      });

      const searchInput = document.getElementById('search');
      const searchResults = document.getElementById('search-results');
      const allNodes = [];
      graph.forEachNode((node, attrs) => allNodes.push({ id: node, label: attrs.label || node, color: attrs.color }));

      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        searchResults.innerHTML = '';
        if (!q) { searchResults.style.display = 'none'; return; }
        const matches = allNodes.filter(n => n.label.toLowerCase().includes(q)).slice(0, 15);
        if (!matches.length) { searchResults.style.display = 'none'; return; }
        searchResults.style.display = 'block';
        matches.forEach(n => {
          const el = document.createElement('div');
          el.className = 'search-item';
          el.textContent = n.label;
          el.style.borderLeft = '3px solid ' + n.color;
          el.style.paddingLeft = '8px';
          el.onclick = () => {
            // Focus camera on node
            const pos = renderer.getNodeDisplayData(n.id);
            if (pos) {
              const camera = renderer.getCamera();
              camera.animate({ x: pos.x, y: pos.y, ratio: 0.15 }, { duration: 400 });
            }
            showInfo(graph, n.id);
            searchResults.style.display = 'none';
            searchInput.value = '';
          };
          searchResults.appendChild(el);
        });
      });

      document.addEventListener('click', e => {
        if (!searchResults.contains(e.target) && e.target !== searchInput)
          searchResults.style.display = 'none';
      });

      const communityMap = new Map();
      graph.forEachNode((node, attrs) => {
        const c = attrs.community || 'other';
        if (!communityMap.has(c)) {
          communityMap.set(c, { color: attrs.color || '#94a3b8', count: 0, nodes: [] });
        }
        const entry = communityMap.get(c);
        entry.count++;
        entry.nodes.push(node);
      });

      const legendEl = document.getElementById('legend');
      const hiddenCommunities = new Set();

      const sortedKeys = [...communityMap.keys()].sort((a, b) => {
        if (a === 'npm') return 1;
        if (b === 'npm') return -1;
        return a.localeCompare(b);
      });

      sortedKeys.forEach(key => {
        const info = communityMap.get(key);
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML =
          '<div class="legend-dot" style="background:' + esc(info.color) + '"></div>' +
          '<span class="legend-label">' + esc(key) + '</span>' +
          '<span class="legend-count">' + info.count + '</span>';

        item.onclick = () => {
          const isHidden = hiddenCommunities.has(key);
          if (isHidden) {
            hiddenCommunities.delete(key);
            item.classList.remove('dimmed');
          } else {
            hiddenCommunities.add(key);
            item.classList.add('dimmed');
          }
          // Toggle node visibility
          info.nodes.forEach(n => {
            graph.setNodeAttribute(n, 'hidden', !isHidden);
          });
          renderer.refresh();
        };

        legendEl.appendChild(item);
      });

      document.getElementById('stats').textContent =
        graph.order + ' nodes \\u00B7 ' + graph.size + ' edges \\u00B7 ' + communityMap.size + ' modules';

      function showInfo(g, nodeId) {
        const attrs = g.getNodeAttributes(nodeId);
        if (!attrs) return;
        const neighbors = g.neighbors(nodeId);
        const neighborHtml = neighbors.map(nid => {
          const nAttrs = g.getNodeAttributes(nid);
          const label = nAttrs.label || nid;
          return '<span class="neighbor-link" data-nid="' + esc(nid) + '">' + esc(label) + '</span>';
        }).join('');

        document.getElementById('info-content').innerHTML =
          '<div class="field"><b>' + esc(attrs.label || nodeId) + '</b></div>' +
          '<div class="field">Module: ' + esc(attrs.community || '-') + '</div>' +
          '<div class="field">Connections: ' + neighbors.length + '</div>' +
          (neighbors.length
            ? '<div style="margin-top:8px;color:#64748b;font-size:11px">Neighbors</div><div id="neighbors-list">' + neighborHtml + '</div>'
            : '');

        document.querySelectorAll('.neighbor-link').forEach(el => {
          el.onclick = () => {
            const nid = el.dataset.nid;
            const pos = renderer.getNodeDisplayData(nid);
            if (pos) {
              const camera = renderer.getCamera();
              camera.animate({ x: pos.x, y: pos.y, ratio: 0.15 }, { duration: 400 });
            }
            showInfo(g, nid);
          };
        });
      }
    }

    boot().catch(err => {
      console.error('Graph boot error:', err);
      document.getElementById('loading-overlay').innerHTML =
        '<span style="color:#ef4444">Error loading graph: ' + err.message + '</span>';
    });
  <\/script>
</body>
</html>`;
}