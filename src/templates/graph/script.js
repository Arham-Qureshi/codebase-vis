    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function boot() {
      const overlay = document.getElementById('loading-overlay');

      // 1. Fetch graph data
      const res = await fetch('./graph.json');
      if (!res.ok) throw new Error('Failed to load graph.json');
      const data = await res.json();

      // 2. Compute degree for every node from edges
      const degree = {};
      for (const e of data.edges) {
        degree[e.source] = (degree[e.source] || 0) + 1;
        degree[e.target] = (degree[e.target] || 0) + 1;
      }

      // 3. Convert nodes to vis-network format
      const rawNodes = data.nodes.map(n => {
        const a = n.attributes;
        const id = n.key;
        const isEntity = ['entity', 'class', 'function', 'method'].includes(a.kind);
        const isExternal = a.external;
        const deg = degree[id] || 0;
        const color = a.color || '#94a3b8';

        let size;
        let fontSize;
        if (isEntity) {
          size = 5;
          fontSize = 0;
        } else if (isExternal) {
          size = 8;
          fontSize = 10;
        } else {
          size = Math.max(10, Math.min(25, deg * 3 + 5));
          fontSize = 12;
        }

        const label = a.label || (isExternal ? id : id.split(/[/\\]/).pop());

        return {
          id,
          label,
          size,
          font: { size: fontSize, color: '#ffffff', face: 'Inter, sans-serif' },
          color: { background: color, border: color },
          borderWidth: isEntity ? 0 : 1,
          _kind: isEntity ? a.kind : (isExternal ? 'external' : 'file'),
          _community: a.community || 'other',
          _language: a.language || '',
          _degree: deg,
          _npm: a.npm === true,
        };
      });

      // 4. Convert edges — inherit color from source node
      const nodeColorMap = {};
      for (const n of rawNodes) {
        nodeColorMap[n.id] = n.color.background;
      }

      const rawEdges = data.edges.map((e, i) => {
        const isContains = e.attributes.relation === 'contains';
        const srcColor = nodeColorMap[e.source] || '#64748b';
        return {
          id: i,
          from: e.source,
          to: e.target,
          title: isContains ? 'contains' : (e.attributes.relationship || 'imports'),
          dashes: isContains,
          width: isContains ? 1 : 2,
          color: { color: srcColor, opacity: 0.55 },
          smooth: { type: 'continuous', roundness: 0.2 },
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        };
      });

      // 5. Build DataSets
      const edgeOriginalWidth = {};
      for (const e of rawEdges) {
        edgeOriginalWidth[e.id] = e.width;
      }
      const nodesDS = new vis.DataSet(rawNodes);
      const edgesDS = new vis.DataSet(rawEdges);

      // 6. Compute stats
      let fileCount = 0, classCount = 0, funcCount = 0, methodCount = 0, entityCount = 0;
      const communityMap = new Map();
      for (const n of rawNodes) {
        if (n._kind === 'class') classCount++;
        else if (n._kind === 'function') funcCount++;
        else if (n._kind === 'method') methodCount++;
        else if (n._kind === 'entity') entityCount++;
        else if (n._kind === 'file') fileCount++;
        const c = n._community;
        if (!communityMap.has(c)) {
          communityMap.set(c, { color: n.color.background, count: 0, nodeIds: [] });
        }
        const entry = communityMap.get(c);
        entry.count++;
        entry.nodeIds.push(n.id);
      }

      // 7. Create network
      const container = document.getElementById('graph-container');
      const network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, {
        physics: {
          enabled: true,
          solver: 'forceAtlas2Based',
          forceAtlas2Based: {
            gravitationalConstant: -120,
            centralGravity: 0.002,
            springLength: 120,
            springConstant: 0.06,
            damping: 0.4,
            avoidOverlap: 0.8,
          },
          stabilization: { iterations: 300, fit: true },
        },
        interaction: {
          hover: true,
          hoverConnectedEdges: false,
          tooltipDelay: 100,
          hideEdgesOnDrag: true,
          navigationButtons: false,
          keyboard: false,
        },
        nodes: { shape: 'dot', borderWidth: 1 },
        edges: { smooth: { type: 'continuous', roundness: 0.2 } },
      });

      // 8. Freeze physics, then setup minimap with final positions
      network.once('stabilizationIterationsDone', () => {
        network.setOptions({ physics: { enabled: false } });
        setupMinimap();
        document.getElementById('minimap-wrap').classList.remove('minimap-hidden');
      });

      // 9. Hide loading overlay
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 600);

      // 10. Track hover — bold connected edges
      let hoveredNodeId = null;
      let boldedEdges = new Set();

      network.on('hoverNode', params => {
        hoveredNodeId = params.node;
        container.style.cursor = 'pointer';

        // Bold connected edges
        const connectedEdges = network.getConnectedEdges(params.node);
        const edgeUpdates = [];
        for (const edgeId of connectedEdges) {
          edgeUpdates.push({ id: edgeId, width: 5, color: { opacity: 0.9 } });
        }
        edgesDS.update(edgeUpdates);
        boldedEdges = new Set(connectedEdges);

        // Show entity label if entity
        const nd = nodesDS.get(params.node);
        if (nd && ['entity', 'class', 'function', 'method'].includes(nd._kind)) {
          nodesDS.update({ id: params.node, font: { size: 10, color: '#ffffff', face: 'Inter, sans-serif' } });
        }
      });
      network.on('blurNode', () => {
        // Reset bolded edges
        const edgeUpdates = [];
        for (const edgeId of boldedEdges) {
          const origWidth = edgeOriginalWidth[edgeId] ?? 2;
          edgeUpdates.push({ id: edgeId, width: origWidth, color: { opacity: 0.55 } });
        }
        edgesDS.update(edgeUpdates);
        boldedEdges = new Set();

        // Reset entity label
        if (hoveredNodeId) {
          const nd = nodesDS.get(hoveredNodeId);
          if (nd && ['entity', 'class', 'function', 'method'].includes(nd._kind)) {
            nodesDS.update({ id: hoveredNodeId, font: { size: 0 } });
          }
        }
        hoveredNodeId = null;
        container.style.cursor = 'default';
      });

      // 11. Click — show info (use hoveredNode for reliable detection)
      container.addEventListener('click', () => {
        if (hoveredNodeId !== null) {
          showInfo(hoveredNodeId);
          network.selectNodes([hoveredNodeId]);
        }
      });
      network.on('click', params => {
        if (params.nodes.length > 0) {
          showInfo(params.nodes[0]);
        } else if (hoveredNodeId === null) {
          document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect</span>';
        }
      });

      // 12. Search
      const searchInput = document.getElementById('search');
      const searchResults = document.getElementById('search-results');
      const allNodeLabels = rawNodes.map(n => ({ id: n.id, label: n.label, color: n.color.background }));

      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        searchResults.innerHTML = '';
        if (!q) { searchResults.style.display = 'none'; return; }
        const matches = allNodeLabels.filter(n => n.label.toLowerCase().includes(q)).slice(0, 15);
        if (!matches.length) { searchResults.style.display = 'none'; return; }
        searchResults.style.display = 'block';
        matches.forEach(n => {
          const el = document.createElement('div');
          el.className = 'search-item';
          el.textContent = n.label;
          el.style.borderLeft = '3px solid ' + n.color;
          el.style.paddingLeft = '8px';
          el.onclick = () => {
            network.focus(n.id, { scale: 1.4, animation: true });
            network.selectNodes([n.id]);
            showInfo(n.id);
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

      // 13. Legend
      const legendEl = document.getElementById('legend');
      const hiddenCommunities = new Set();

      const keysToSkip = new Set(['dependencies', 'entities']);
      const sortedKeys = [...communityMap.keys()]
        .filter(k => !keysToSkip.has(k))
        .sort((a, b) => a.localeCompare(b));

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
          const update = info.nodeIds.map(nid => ({ id: nid, hidden: !isHidden }));
          nodesDS.update(update);
        };

        legendEl.appendChild(item);
      });

      const totalEntities = classCount + funcCount + methodCount + entityCount;
      document.getElementById('stats').textContent =
        fileCount + ' files \u00B7 ' + totalEntities + ' entities (' + classCount + ' classes, ' + funcCount + ' functions, ' + methodCount + ' methods) \u00B7 ' + rawEdges.length + ' edges \u00B7 ' + communityMap.size + ' modules';

      // 14. Filters — toggle dependencies and entities
      const depNodeIds = rawNodes.filter(n => n._npm).map(n => n.id);
      const entityNodeIds = rawNodes.filter(n => ['entity', 'class', 'function', 'method'].includes(n._kind)).map(n => n.id);
      document.getElementById('dep-count').textContent = depNodeIds.length;
      document.getElementById('entity-count').textContent = entityNodeIds.length;

      const hiddenFilters = {};
      document.getElementById('toggle-deps').onclick = function () {
        const isHidden = hiddenFilters.deps;
        hiddenFilters.deps = !isHidden;
        this.classList.toggle('dimmed');
        nodesDS.update(depNodeIds.map(id => ({ id, hidden: !isHidden })));
      };
      document.getElementById('toggle-entities').onclick = function () {
        const isHidden = hiddenFilters.entities;
        hiddenFilters.entities = !isHidden;
        this.classList.toggle('dimmed');
        nodesDS.update(entityNodeIds.map(id => ({ id, hidden: !isHidden })));
      };

      // 15. Info panel
      function showInfo(nodeId) {
        const n = nodesDS.get(nodeId);
        if (!n) return;
        const neighborIds = network.getConnectedNodes(nodeId);
        const neighborHtml = neighborIds.map(nid => {
          const nb = nodesDS.get(nid);
          const label = nb ? nb.label : nid;
          const color = nb ? nb.color.background : '#555';
          return '<span class="neighbor-link" style="border-left:3px solid ' + esc(color) + '" data-nid="' + esc(nid) + '">' + esc(label) + '</span>';
        }).join('');

        let extra = '';
        let moduleLabel = esc(n._community || '-');
        if (['entity', 'class', 'function', 'method'].includes(n._kind)) {
          const sepIdx = nodeId.lastIndexOf('::');
          const parentFile = sepIdx !== -1 ? nodeId.slice(0, sepIdx) : nodeId;
          moduleLabel = 'entities';
          extra = '<div class="field">Defined in: ' + esc(parentFile) + '</div>';
        }

        document.getElementById('info-content').innerHTML =
          '<div class="field"><b>' + esc(n.label) + '</b></div>' +
          '<div class="field">Module: ' + moduleLabel + '</div>' +
          extra +
          '<div class="field">Connections: ' + neighborIds.length + '</div>' +
          (neighborIds.length
            ? '<div style="margin-top:8px;color:#64748b;font-size:11px">Neighbors</div><div id="neighbors-list">' + neighborHtml + '</div>'
            : '');

        document.querySelectorAll('.neighbor-link').forEach(el => {
          el.onclick = () => {
            const nid = el.dataset.nid;
            network.focus(nid, { scale: 1.4, animation: true });
            network.selectNodes([nid]);
            showInfo(nid);
          };
        });
      }

      let minimapVisible = true;
      let minimapAnimating = false;
      function setupMinimap() {
        const wrap = document.getElementById('minimap-wrap');
        const canvas = document.getElementById('minimap');
        const ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        const wrapRect = wrap.getBoundingClientRect();
        const w = wrapRect.width;
        const h = wrapRect.height;
        if (w === 0 || h === 0) return;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        let prevMinX, prevMinY, prevRangeX, prevRangeY;

        function computeBounds() {
          const positions = network.getPositions();
          const nodeIds = Object.keys(positions);
          if (nodeIds.length === 0) return false;

          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const id of nodeIds) {
            const p = positions[id];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }

          const pad = 0.05;
          const padX = (maxX - minX) * pad || 50;
          const padY = (maxY - minY) * pad || 50;
          prevMinX = minX - padX;
          prevMinY = minY - padY;
          prevRangeX = (maxX - minX) + padX * 2;
          prevRangeY = (maxY - minY) + padY * 2;
          return true;
        }

        function toX(nx) { return ((nx - prevMinX) / prevRangeX) * w; }
        function toY(ny) { return ((ny - prevMinY) / prevRangeY) * h; }

        function draw() {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);

          if (!computeBounds()) return;

          const positions = network.getPositions();

          const colorMap = {};
          for (const n of rawNodes) colorMap[n.id] = n.color.background;

          ctx.globalAlpha = 0.12;
          ctx.lineWidth = 0.5;
          for (const e of rawEdges) {
            const from = positions[e.from];
            const to = positions[e.to];
            if (!from || !to) continue;
            ctx.strokeStyle = colorMap[e.from] || '#64748b';
            ctx.beginPath();
            ctx.moveTo(toX(from.x), toY(from.y));
            ctx.lineTo(toX(to.x), toY(to.y));
            ctx.stroke();
          }
          ctx.globalAlpha = 0.3;

          const nodeIds = Object.keys(positions);
          const nodeR = Math.max(0.6, Math.min(1.2, 1.2 - ((nodeIds.length - 50) / 450) * 0.6));
          for (const n of rawNodes) {
            const p = positions[n.id];
            if (!p) continue;
            ctx.beginPath();
            ctx.arc(toX(p.x), toY(p.y), nodeR, 0, Math.PI * 2);
            ctx.fillStyle = n.color.background;
            ctx.fill();
          }
          ctx.globalAlpha = 1;

          const scale = network.getScale();
          const viewPos = network.getViewPosition();
          const vw = container.clientWidth / scale;
          const vh = container.clientHeight / scale;
          const rx = toX(viewPos.x - vw / 2);
          const ry = toY(viewPos.y - vh / 2);
          const rw = (vw / prevRangeX) * w;
          const rh = (vh / prevRangeY) * h;

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.fillRect(rx, ry, rw, rh);
        }

        draw();
        network.on('afterDrawing', draw);

        let isDragging = false;
        canvas.addEventListener('mousedown', (e) => {
          if (minimapAnimating) return;
          if (!prevRangeX) return;
          const r = canvas.getBoundingClientRect();
          const mx = Math.max(0, Math.min(w, (e.clientX - r.left) * (w / r.width)));
          const my = Math.max(0, Math.min(h, (e.clientY - r.top) * (h / r.height)));
          const nx = ((mx / w) * prevRangeX) + prevMinX;
          const ny = ((my / h) * prevRangeY) + prevMinY;

          isDragging = true;
          canvas.style.cursor = 'grabbing';
          minimapAnimating = true;
          network.moveTo({
            position: { x: nx, y: ny },
            scale: network.getScale(),
            animation: { duration: 400, easingFunction: 'easeInOutQuad' }
          });
          network.once('animationFinished', () => { minimapAnimating = false; draw(); });
        });

        document.addEventListener('mousemove', (e) => {
          if (!isDragging || !prevRangeX) return;
          const r = canvas.getBoundingClientRect();
          const mx = Math.max(0, Math.min(w, (e.clientX - r.left) * (w / r.width)));
          const my = Math.max(0, Math.min(h, (e.clientY - r.top) * (h / r.height)));
          const nx = ((mx / w) * prevRangeX) + prevMinX;
          const ny = ((my / h) * prevRangeY) + prevMinY;
          network.moveTo({
            position: { x: nx, y: ny },
            scale: network.getScale(),
            animation: { duration: 200, easingFunction: 'easeOutQuad' }
          });
        });

        document.addEventListener('mouseup', () => {
          if (isDragging) { isDragging = false; canvas.style.cursor = 'pointer'; }
        });

        wrap.addEventListener('mouseenter', () => { canvas.style.cursor = 'pointer'; });
        wrap.addEventListener('mouseleave', () => { if (!isDragging) canvas.style.cursor = 'default'; });
      }

      // M key toggle
      document.addEventListener('keydown', (e) => {
        if (e.key === 'm' || e.key === 'M') {
          if (e.target.tagName === 'INPUT') return;
          minimapVisible = !minimapVisible;
          document.getElementById('minimap-wrap').classList.toggle('minimap-hidden', !minimapVisible);
        }
      });

      // Non-blocking cycle loading (runs after graph renders)
      loadCycles(network, nodesDS, edgesDS, rawEdges, nodeColorMap, rawNodes);
    }

    async function loadCycles(network, nodesDS, edgesDS, rawEdges, nodeColorMap, rawNodes) {
      let cyclesData;
      try {
        const cyclesRes = await fetch('./cycles.json');
        if (!cyclesRes.ok) return;
        cyclesData = await cyclesRes.json();
      } catch {
        return;
      }
      let cycles = cyclesData;
      if (cyclesData && cyclesData.cycles) cycles = cyclesData.cycles;
      if (!Array.isArray(cycles)) return;

      document.getElementById('cycles-wrap').style.display = 'block';

      document.getElementById('cycle-count').textContent = ` (${cycles.length})`;

      if (!cycles.length) {
        document.getElementById('cycles-list').innerHTML = '<div class="search-item" style="padding-left:8px;color:#94a3b8;font-style:italic;">No cycles detected</div>';
        return;
      }

      const cycleState = { active: false, cycles, cycleNodeIds: new Set(), cycleEdgeIds: new Set() };

      for (const c of cycleState.cycles) {
        for (const f of c.files) cycleState.cycleNodeIds.add(f.id);
        for (const e of c.edges) cycleState.cycleEdgeIds.add(e.from + '|' + e.to);
      }

      const cyclesList = document.getElementById('cycles-list');
      for (const c of cycleState.cycles) {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.style.borderLeft = '3px solid #ef4444';
        item.style.paddingLeft = '8px';
        item.style.cursor = 'pointer';
        item.textContent = c.label;
        item.onclick = () => focusCycle(c);
        cyclesList.appendChild(item);
      }

      document.getElementById('toggle-cycles').onclick = function () {
        cycleState.active = !cycleState.active;
        this.classList.toggle('dimmed', !cycleState.active);

        const edgeUpdates = [];
        for (const edge of rawEdges) {
          const edgeKey = edge.from + '|' + edge.to;
          if (cycleState.cycleEdgeIds.has(edgeKey)) {
            edgeUpdates.push({
              id: edge.id,
              color: { color: cycleState.active ? '#ef4444' : nodeColorMap[edge.from] || '#64748b', opacity: cycleState.active ? 0.9 : 0.55 },
              width: cycleState.active ? 3 : (edge.dashes ? 1 : 2),
            });
          }
        }
        edgesDS.update(edgeUpdates);

        const nodeUpdates = [];
        for (const node of rawNodes) {
          if (cycleState.cycleNodeIds.has(node.id)) {
            nodeUpdates.push({ id: node.id, opacity: cycleState.active ? 1 : undefined });
          } else if (cycleState.active) {
            nodeUpdates.push({ id: node.id, opacity: 0.15 });
          }
        }
        if (nodeUpdates.length) nodesDS.update(nodeUpdates);

        if (cycleState.active && cycleState.cycles.length) {
          const firstCycleNodes = cycleState.cycles[0].files.map(f => f.id);
          network.focus(firstCycleNodes[0], { scale: 1.2, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
        }
      };

      function focusCycle(cycle) {
        if (!cycleState.active) {
          document.getElementById('toggle-cycles').click();
        }
        const cycleNodeIds = cycle.files.map(f => f.id);
        network.focus(cycleNodeIds[0], { scale: 1.3, animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
      }
    }

    boot().catch(err => {
      console.error('Graph boot error:', err);
      document.getElementById('loading-overlay').innerHTML =
        '<span style="color:#ef4444">Error loading graph: ' + err.message + '</span>';
    });
