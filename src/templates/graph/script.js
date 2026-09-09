    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function hl(text, q){
      if(!q) return esc(text);
      const i = text.toLowerCase().indexOf(q);
      if(i<0) return esc(text);
      return esc(text.slice(0,i)) + '<mark>' + esc(text.slice(i,i+q.length)) + '</mark>' + esc(text.slice(i+q.length));
    }

    (function initTheme(){
      const KEY='codebase-vis:theme';
      const btns=[...document.querySelectorAll('.theme-toggle button')];
      function apply(v){
        const saved = v;
        let eff = v;
        if(v==='auto') eff = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light':'dark';
        if(eff==='light') document.documentElement.setAttribute('data-theme','light');
        else document.documentElement.removeAttribute('data-theme');
        document.documentElement.style.colorScheme = eff==='light'?'light':'dark';
        try{ document.querySelector('meta[name="theme-color"]').setAttribute('content', eff==='light' ? '#fafaf7' : '#0b0b0f'); }catch{}
        btns.forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.themeVal===saved)));
        try{ localStorage.setItem(KEY, saved); }catch{}
      }
      let current;
      try{ current = localStorage.getItem(KEY) || 'auto'; }catch{ current='auto'; }
      if(!['dark','light','auto'].includes(current)) current='auto';
      apply(current);
      btns.forEach(b=> b.addEventListener('click', ()=> apply(b.dataset.themeVal)));
      try{
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{
          let cur;
          try{ cur = localStorage.getItem(KEY)||'auto'; }catch{ cur='auto'; }
          if(cur==='auto') apply('auto');
        });
      }catch{}
    })();

    async function boot() {
      const overlay = document.getElementById('loading-overlay');
      const container = document.getElementById('graph-container');
      const canvas = document.getElementById('graph-canvas');
      const ctx = canvas.getContext('2d');

      // ─── 1. Fetch graph data ───────────────────────────────────
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let res;
      try {
        res = await fetch('./graph.json', { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) throw new Error('Failed to load graph.json');
      const data = await res.json();

      const boundaryRadius = Math.sqrt(data.nodes.length) * 45;

      // ─── 2. Compute degree for every node ───────────────────────
      const degree = {};
      for (const e of data.edges) {
        degree[e.source] = (degree[e.source] || 0) + 1;
        degree[e.target] = (degree[e.target] || 0) + 1;
      }

      // ─── 3. Build node objects ──────────────────────────────────
      const nodes = data.nodes.map(n => {
        const a = n.attributes;
        const id = n.key;
        const isEntity = ['entity', 'class', 'function', 'method', 'dependency', 'pkg-category', 'pkg-metadata', 'keyword', 'script', 'heading'].includes(a.kind);
        const isExternal = a.external;
        const deg = degree[id] || 0;
        const color = a.color || '#94a3b8';

        let radius;
        if (isEntity) {
          radius = a.kind === 'pkg-category' ? 6 : a.kind === 'dependency' ? 4 : a.kind === 'pkg-metadata' || a.kind === 'keyword' || a.kind === 'script' ? 3 : 3;
        } else if (isExternal) {
          radius = 5;
        } else {
          radius = Math.max(4, Math.min(20, Math.sqrt(deg) * 4));
        }

        const label = a.label || (isExternal ? id : id.split(/[/\\]/).pop());

        return {
          id,
          label,
          radius,
          color,
          _kind: isEntity ? a.kind : (isExternal ? 'external' : 'file'),
          _community: a.community || 'other',
          _language: a.language || '',
          _degree: deg,
          _npm: a.npm === true,
          _hidden: false,
          _opacity: 1,
          x: 0,
          y: 0,
        };
      });

      // Scatter nodes inside circle at 40% of boundary radius
      for (const n of nodes) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * (boundaryRadius * 0.4);
        n.x = Math.cos(angle) * r;
        n.y = Math.sin(angle) * r;
      }

      const nodeMap = new Map();
      for (const n of nodes) nodeMap.set(n.id, n);

      // ─── 4. Build link objects ──────────────────────────────────
      const links = data.edges.map((e, i) => {
        const isContains = e.attributes.relation === 'contains';
        const srcNode = nodeMap.get(e.source);
        const srcColor = srcNode ? srcNode.color : '#64748b';
        return {
          index: i,
          source: e.source,
          target: e.target,
          _relation: e.attributes.relationship || (isContains ? 'contains' : 'imports'),
          _isContains: isContains,
          _color: srcColor,
          _width: isContains ? 0.5 : 1.2,
          _opacity: 0.25,
        };
      });

      // ─── 5. Compute stats ──────────────────────────────────────
      let fileCount = 0, classCount = 0, funcCount = 0, methodCount = 0, entityCount = 0;
      const communityMap = new Map();
      for (const n of nodes) {
        if (n._kind === 'class') classCount++;
        else if (n._kind === 'function') funcCount++;
        else if (n._kind === 'method') methodCount++;
        else if (n._kind === 'entity') entityCount++;
        else if (n._kind === 'file') fileCount++;
        const c = n._community;
        if (!communityMap.has(c)) {
          communityMap.set(c, { color: n.color, count: 0, nodeIds: [] });
        }
        const entry = communityMap.get(c);
        entry.count++;
        entry.nodeIds.push(n.id);
      }

      // ─── 6. Adjacency index for neighbor lookups ────────────────
      const adjacency = new Map();
      for (const n of nodes) adjacency.set(n.id, new Set());
      for (const l of links) {
        const sid = typeof l.source === 'object' ? l.source.id : l.source;
        const tid = typeof l.target === 'object' ? l.target.id : l.target;
        adjacency.get(sid)?.add(tid);
        adjacency.get(tid)?.add(sid);
      }
      function getNeighbors(nodeId) {
        return adjacency.get(nodeId) || new Set();
      }
      function getConnectedLinks(nodeId) {
        return links.filter(l => {
          const sid = typeof l.source === 'object' ? l.source.id : l.source;
          const tid = typeof l.target === 'object' ? l.target.id : l.target;
          return sid === nodeId || tid === nodeId;
        });
      }

      // ─── 7. Canvas sizing (High-DPI) ──────────────────────────
      let width = container.clientWidth;
      let height = container.clientHeight;
      let dpr = window.devicePixelRatio || 1;
      let initialized = false;

      function resizeCanvas() {
        width = container.clientWidth;
        height = container.clientHeight;
        dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        if (initialized) renderDispatch();
      }
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      // ─── 8. Zoom & Pan (d3-zoom) ──────────────────────────────
      let currentTransform = d3.zoomIdentity;

      const zoom = d3.zoom()
        .scaleExtent([0.05, 8])
        .filter(event => {
          // Allow drag on nodes: only zoom on wheel, right-click, or when not over a node
          if (event.type === 'mousedown' || event.type === 'touchstart') {
            const [mx, my] = d3.pointer(event, canvas);
            return !nodeAtPoint(mx, my);
          }
          return true;
        })
        .on('zoom', (event) => {
          currentTransform = event.transform;
          renderDispatch();
        });

      d3.select(canvas)
        .call(zoom)
        .on('dblclick.zoom', null); // Disable double-click zoom

      // ─── 9. Interaction state ─────────────────────────────────
      let hoveredNode = null;
      let selectedNode = null;
      let dragNode = null;

      // ─── 9b. Focused mode state ─────────────────────────────
      let focusedFileId = null;     // null = global, string = file id
      let focusedNodeSet = null;    // Set of node ids in focused view
      let focusedLinks = null;      // filtered links for focused view
      let focusedSimulation = null; // separate D3 simulation for focused view

      // ─── 10. Spatial hit-testing ───────────────────────────────
      function nodeAtPoint(mx, my) {
        // Transform mouse coords to simulation space
        const [sx, sy] = currentTransform.invert([mx, my]);
        const k = currentTransform.k;
        const hitNodes = focusedSimulation ? focusedSimulation.nodes() : nodes;
        // Check nodes in reverse (top-drawn last = top)
        for (let i = hitNodes.length - 1; i >= 0; i--) {
          const n = hitNodes[i];
          if (n._hidden) continue;
          const dx = sx - n.x;
          const dy = sy - n.y;
          const hitR = Math.max(n.radius, 6) / k + n.radius; // generous hit area
          if (dx * dx + dy * dy < hitR * hitR) return n;
        }
        return null;
      }

      // ─── 10b. Custom radial boundary force ──────────────────────
      function forceBoundary(radius) {
        let nodes;
        function force(alpha) {
          for (const d of nodes) {
            const dx = d.x;
            const dy = d.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) {
              const ratio = (dist - radius) / dist;
              d.vx -= dx * ratio * alpha * 0.3;
              d.vy -= dy * ratio * alpha * 0.3;
            }
          }
        }
        force.initialize = function(_) { nodes = _; };
        force.radius = function(_) {
          if (!arguments.length) return radius;
          radius = _;
          return force;
        };
        return force;
      }

      // ─── 11. D3 Force Simulation (Obsidian physics) ─────────────
      const simulation = d3.forceSimulation(nodes)
        .force('charge', d3.forceManyBody()
          .strength(-200)
          .distanceMax(500)
        )
        .force('link', d3.forceLink(links)
          .id(d => d.id)
          .distance(l => l._isContains ? 50 : 120)
          .strength(l => l._isContains ? 0.8 : 0.3)
        )
        .force('collide', d3.forceCollide()
          .radius(d => d.radius + 4)
          .strength(0.7)
        )
        .force('center', d3.forceCenter(0, 0).strength(0.06))
        .force('boundary', forceBoundary(boundaryRadius))
        .alphaDecay(0.02)
        .velocityDecay(0.35)
        .on('tick', renderDispatch);
      initialized = true;

      // ─── 12. Canvas Render Loop ─────────────────────────────────
      function renderDispatch() {
        if (focusedFileId) renderFocused();
        else render();
      }
      function render() {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        ctx.translate(currentTransform.x, currentTransform.y);
        ctx.scale(currentTransform.k, currentTransform.k);

        const k = currentTransform.k;
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';

        const hoveredId = hoveredNode ? hoveredNode.id : null;
        const selectedId = selectedNode ? selectedNode.id : null;
        const activeId = hoveredId || selectedId;
        const activeNeighbors = activeId ? getNeighbors(activeId) : null;

        // ── Draw edges ──
        for (const l of links) {
          const s = l.source;
          const t = l.target;
          if (s._hidden || t._hidden) continue;

          let alpha = l._opacity;
          let lineWidth = l._width;
          let strokeColor = l._color;

          if (activeId) {
            const sid = s.id;
            const tid = t.id;
            if (sid === activeId || tid === activeId) {
              alpha = 0.85;
              lineWidth = l._isContains ? 1 : 2.5;
            } else {
              alpha = 0.06;
            }
          }

          ctx.globalAlpha = alpha * (s._opacity + t._opacity) / 2;
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = lineWidth / k;

          if (l._isContains) {
            ctx.setLineDash([4 / k, 4 / k]);
          }

          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();

          if (l._isContains) {
            ctx.setLineDash([]);
          }

          // Arrow head for non-contains edges
          if (!l._isContains && k > 0.3) {
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const ux = dx / len;
              const uy = dy / len;
              const arrowLen = 6 / k;
              const arrowW = 3 / k;
              const tipX = t.x - ux * (t.radius + 2);
              const tipY = t.y - uy * (t.radius + 2);
              ctx.fillStyle = strokeColor;
              ctx.globalAlpha = alpha * 0.7;
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(tipX - ux * arrowLen + uy * arrowW, tipY - uy * arrowLen - ux * arrowW);
              ctx.lineTo(tipX - ux * arrowLen - uy * arrowW, tipY - uy * arrowLen + ux * arrowW);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        // ── Draw nodes ──
        for (const n of nodes) {
          if (n._hidden) continue;

          let nodeAlpha = n._opacity;
          let glowRadius = 0;

          if (activeId) {
            if (n.id === activeId) {
              nodeAlpha = 1;
              glowRadius = 12;
            } else if (activeNeighbors && activeNeighbors.has(n.id)) {
              nodeAlpha = 0.9;
            } else {
              nodeAlpha = 0.12;
            }
          }

          ctx.globalAlpha = nodeAlpha;

          // Glow effect for hovered/selected node
          if (glowRadius > 0) {
            ctx.shadowColor = n.color;
            ctx.shadowBlur = glowRadius / k;
          }

          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          ctx.fill();

          if (glowRadius > 0) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }

          // Border ring
          if (n._kind === 'file' || n._kind === 'external') {
            ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 0.5 / k;
            ctx.stroke();
          }
        }

        // ── Draw labels (LOD) ──
        const showLabelsThreshold = 0.4;
        if (k > showLabelsThreshold) {
          const labelAlphaBase = Math.min(1, (k - showLabelsThreshold) / 0.6);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          for (const n of nodes) {
            if (n._hidden) continue;

            let showLabel = false;
            let labelAlpha = labelAlphaBase;

            if (n.id === activeId) {
              showLabel = true;
              labelAlpha = 1;
            } else if (activeNeighbors && activeNeighbors.has(n.id)) {
              showLabel = true;
              labelAlpha = 0.85;
            } else if (!activeId) {
              // Entity labels only show at high zoom
              if (['entity', 'class', 'function', 'method'].includes(n._kind)) {
                showLabel = k > 1.8;
                labelAlpha *= 0.7;
              } else if (['dependency', 'pkg-category', 'pkg-metadata', 'keyword', 'script'].includes(n._kind)) {
                showLabel = k > 0.8;
                labelAlpha *= 0.8;
              } else {
                showLabel = true;
              }
            } else {
              showLabel = false;
            }

            if (!showLabel) continue;

            const fontSize = Math.max(8, Math.min(14, 11)) / k;
            ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.globalAlpha = labelAlpha * n._opacity;
            ctx.fillStyle = isLight ? '#18181b' : '#e6e6eb';
            ctx.fillText(n.label, n.x, n.y + n.radius + 3 / k);
          }
        }

        // Always show label for hovered/selected node regardless of zoom
        if (activeId && k <= showLabelsThreshold) {
          const n = nodeMap.get(activeId);
          if (n && !n._hidden) {
            const fontSize = 11 / k;
            ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.globalAlpha = 1;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const isLight2 = document.documentElement.getAttribute('data-theme') === 'light';
            ctx.fillStyle = isLight2 ? '#18181b' : '#e6e6eb';
            ctx.fillText(n.label, n.x, n.y + n.radius + 3 / k);
          }
        }

        ctx.restore();
      }

      // ─── 13. Obsidian Drag Handler ─────────────────────────────
      function dragSubject(event) {
        const [mx, my] = d3.pointer(event, canvas);
        return nodeAtPoint(mx, my);
      }

      d3.select(canvas).call(
        d3.drag()
          .container(canvas)
          .subject(dragSubject)
          .on('start', dragStarted)
          .on('drag', dragged)
          .on('end', dragEnded)
      );

      function dragStarted(event) {
        if (!event.subject) return;
        dragNode = event.subject;
        const activeSim = focusedSimulation || simulation;
        activeSim.alphaTarget(0.2).restart();
        dragNode.fx = dragNode.x;
        dragNode.fy = dragNode.y;
        selectedNode = dragNode;
        showInfo(dragNode.id);
      }

      function dragged(event) {
        if (!dragNode) return;
        const [sx, sy] = currentTransform.invert([event.sourceEvent.offsetX, event.sourceEvent.offsetY]);
        dragNode.fx = sx;
        dragNode.fy = sy;
      }

      function dragEnded(event) {
        if (!dragNode) return;
        const activeSim = focusedSimulation || simulation;
        activeSim.alphaTarget(0);
        if (!event.sourceEvent.shiftKey) {
          dragNode.fx = null;
          dragNode.fy = null;
        } else {
          showToast('Pinned — drag again to move');
        }
        dragNode = null;
      }

      // ─── 14. Mouse hover (non-drag) ───────────────────────────
      canvas.addEventListener('mousemove', (e) => {
        if (dragNode) return; // Don't change hover during drag
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = nodeAtPoint(mx, my);
        if (hit !== hoveredNode) {
          hoveredNode = hit;
          canvas.style.cursor = hit ? 'pointer' : 'default';
          renderDispatch();
        }
      });

      canvas.addEventListener('mouseleave', () => {
        if (hoveredNode) {
          hoveredNode = null;
          canvas.style.cursor = 'default';
          renderDispatch();
        }
      });

      // ─── 15. Click — show info panel ──────────────────────────
      canvas.addEventListener('click', (e) => {
        if (dragNode) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = nodeAtPoint(mx, my);
        if (hit) {
          selectedNode = hit;
          showInfo(hit.id);
          // In focused mode, clicking a neighbor file switches focus
          if (focusedFileId && hit._kind === 'file' && hit.id !== focusedFileId) {
            enterFocusedMode(hit.id);
          } else {
            renderDispatch();
          }
        } else {
          selectedNode = null;
          document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect · hover to preview</span>';
          document.getElementById('info-meta').innerHTML='';
          renderDispatch();
        }
      });

      // ─── 16. Toolbar ──────────────────────────────────────────
      const metaEl = document.getElementById('graph-meta');
      if(metaEl) metaEl.textContent = fileCount + ' files · ' + links.length + ' edges · ' + communityMap.size + ' modules';

      document.getElementById('btn-fit')?.addEventListener('click', () => {
        if (focusedFileId) { fitFocusedView(); return; }
        // Compute bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
          if (n._hidden) continue;
          if (n.x < minX) minX = n.x;
          if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.y > maxY) maxY = n.y;
        }
        if (!isFinite(minX)) return;
        const pad = 60;
        const bw = maxX - minX + pad * 2;
        const bh = maxY - minY + pad * 2;
        const scale = Math.min(width / bw, height / bh, 2);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const t = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(scale)
          .translate(-cx, -cy);

        d3.select(canvas)
          .transition()
          .duration(500)
          .ease(d3.easeCubicInOut)
          .call(zoom.transform, t);
      });

      document.getElementById('btn-reheat')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        btn.setAttribute('aria-busy','true');
        showToast('Reheating…');
        simulation.alpha(0.6).restart();
        setTimeout(() => {
          btn.removeAttribute('aria-busy');
          showToast('Layout settled');
        }, 2000);
      });

      const btnMenu = document.getElementById('btn-menu');
      const sidebar = document.getElementById('sidebar');
      btnMenu?.addEventListener('click', () => {
        const open = sidebar.classList.toggle('is-open');
        btnMenu.setAttribute('aria-expanded', String(open));
      });
      document.getElementById('graph-container')?.addEventListener('click', (e) => {
        if (e.target !== canvas) return;
        if(window.innerWidth<=900 && sidebar.classList.contains('is-open')){
          sidebar.classList.remove('is-open');
          btnMenu?.setAttribute('aria-expanded','false');
        }
      });
      document.addEventListener('keydown', (e) => {
        if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); document.getElementById('search')?.focus(); }
        if(e.key==='/' && !/INPUT|TEXTAREA/.test(e.target.tagName)){ e.preventDefault(); document.getElementById('search')?.focus(); }
      });

      function showToast(msg, ms=2200){
        const t=document.getElementById('toast');
        if(!t) return;
        t.textContent=msg;
        t.style.display='block';
        clearTimeout(t._hide);
        t._hide=setTimeout(()=> t.style.display='none', ms);
      }

      function updateBlankGuard(){
        const hidden = nodes.filter(n=> n._hidden).length;
        const guard=document.getElementById('blank-guard');
        if(!guard) return;
        if(hidden >= nodes.length && nodes.length>0){ guard.style.display='flex'; }
        else guard.style.display='none';
      }
      document.getElementById('btn-reset-from-blank')?.addEventListener('click', ()=> document.getElementById('btn-reset-filters')?.click());

      // ─── 17. Wait for initial stabilization ───────────────────
      const t0 = performance.now();
      // Let simulation run for a bit then auto-fit
      setTimeout(() => {
        const dt = Math.round(performance.now() - t0);
        // Auto-fit view
        document.getElementById('btn-fit')?.click();
        setupMinimap();
        document.getElementById('minimap-wrap').classList.remove('minimap-hidden');
        showToast('Stabilized in ' + dt + 'ms · ' + nodes.length + ' nodes');
      }, 3000);

      // ─── 18. Hide loading overlay ─────────────────────────────
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 600);

      // ─── 19. Search ───────────────────────────────────────────
      const searchInput = document.getElementById('search');
      const searchResults = document.getElementById('search-results');
      const searchClear = document.getElementById('search-clear');
      const allNodeLabels = nodes.map(n => ({ id: n.id, label: n.label, color: n.color, community: n._community, kind: n._kind }));
      let activeIdx = -1;

      function focusNode(nodeId, scale) {
        const n = nodeMap.get(nodeId);
        if (!n) return;
        const s = scale || 1.4;
        const t = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(s)
          .translate(-n.x, -n.y);
        d3.select(canvas)
          .transition()
          .duration(500)
          .ease(d3.easeCubicInOut)
          .call(zoom.transform, t);
      }

      function renderSearch(q){
        const query = q.toLowerCase().trim();
        activeIdx=-1;
        searchResults.innerHTML = '';
        if (!query) { searchResults.style.display = 'none'; return; }
        const allMatches = allNodeLabels.filter(n => n.label.toLowerCase().includes(query));
        const matches = allMatches.slice(0, 8);
        const more = allMatches.length - matches.length;
        if (!matches.length) {
          searchResults.style.display = 'block';
          searchResults.innerHTML = '<div class="search-item" style="pointer-events:none;color:var(--muted)">No results for \u201c' + esc(q) + '\u201d</div>';
          return;
        }
        searchResults.style.display = 'block';
        matches.forEach((n, idx) => {
          const el = document.createElement('button');
          el.type='button';
          el.className = 'search-item';
          el.setAttribute('role','option');
          el.innerHTML = '<span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + hl(n.label, query) + ' <span style="color:var(--muted);font-size:10px">' + esc(n.community) + ' · ' + esc(n.kind) + '</span></span><span style="width:8px;height:8px;border-radius:50%;background:'+ esc(n.color) +' ;flex-shrink:0"></span>';
          el.style.borderInlineStart = '1px solid ' + n.color;
          el.style.paddingLeft = '8px';
          el.addEventListener('click', () => {
            if (n.kind === 'file') {
              enterFocusedMode(n.id);
            } else {
              focusNode(n.id, 1.4);
              selectedNode = nodeMap.get(n.id);
              showInfo(n.id);
              renderDispatch();
            }
            searchResults.style.display = 'none';
            searchInput.value = '';
          });
          el.addEventListener('mouseenter', ()=> { [...searchResults.children].forEach(c=>c.classList.remove('is-active')); el.classList.add('is-active'); activeIdx=idx; });
          searchResults.appendChild(el);
        });
        if(more>0){
          const moreEl=document.createElement('div');
          moreEl.className='search-item';
          moreEl.style.cssText='justify-content:center;color:var(--muted);font-size:11px;pointer-events:none';
          moreEl.textContent = '+' + more + ' more \u2014 keep typing to narrow';
          searchResults.appendChild(moreEl);
        }
      }
      searchInput.addEventListener('input', () => renderSearch(searchInput.value));
      searchInput.addEventListener('keydown', (e)=>{
        const items=[...searchResults.children].filter(c=>c.getAttribute('role')==='option');
        if(!items.length || searchResults.style.display==='none') return;
        if(e.key==='ArrowDown'){ e.preventDefault(); activeIdx=Math.min(activeIdx+1, items.length-1); items.forEach((c,i)=>c.classList.toggle('is-active', i===activeIdx)); items[activeIdx]?.scrollIntoView({block:'nearest'}); }
        else if(e.key==='ArrowUp'){ e.preventDefault(); activeIdx=Math.max(activeIdx-1, 0); items.forEach((c,i)=>c.classList.toggle('is-active', i===activeIdx)); }
        else if(e.key==='Enter'){ e.preventDefault(); if(activeIdx>=0) items[activeIdx].click(); else if(items[0]) items[0].click(); }
        else if(e.key==='Escape'){ searchResults.style.display='none'; }
      });
      searchClear.addEventListener('click', ()=>{ searchInput.value=''; searchResults.style.display='none'; searchInput.focus(); });
      document.addEventListener('click', e => {
        if (!searchResults.contains(e.target) && e.target !== searchInput && e.target!==searchClear)
          searchResults.style.display = 'none';
      });

      // ─── 20. Legend ───────────────────────────────────────────
      const legendEl = document.getElementById('legend');
      const legendCount = document.getElementById('legend-count');
      if(legendCount) legendCount.textContent = communityMap.size + ' modules';
      const hiddenCommunities = new Set();
      const keysToSkip = new Set(['dependencies', 'entities', 'package-config', 'documentation']);
      const sortedKeys = [...communityMap.keys()]
        .filter(k => !keysToSkip.has(k))
        .sort((a, b) => a.localeCompare(b));
      const MAX_LEGEND_VISIBLE = 4;
      let legendExpanded=false;

      function renderLegend(){
        legendEl.innerHTML='';
        const toShow = legendExpanded ? sortedKeys : sortedKeys.slice(0, MAX_LEGEND_VISIBLE);
        toShow.forEach(key => {
          const info = communityMap.get(key);
          const item = document.createElement('button');
          item.type='button';
          item.className = 'legend-item';
          item.setAttribute('aria-pressed', String(hiddenCommunities.has(key)));
          if(hiddenCommunities.has(key)) item.classList.add('dimmed');
          item.innerHTML =
            '<span class="legend-dot" style="background:' + esc(info.color) + '"></span>' +
            '<span class="legend-label">' + esc(key) + '</span>' +
            '<span class="legend-count">' + info.count + '</span>';
          item.addEventListener('click', () => {
            const isHidden = hiddenCommunities.has(key);
            if (isHidden) {
              hiddenCommunities.delete(key);
              item.classList.remove('dimmed');
              item.setAttribute('aria-pressed','false');
              showToast('Showing ' + key);
            } else {
              hiddenCommunities.add(key);
              item.classList.add('dimmed');
              item.setAttribute('aria-pressed','true');
              showToast('Hid ' + key + ' \u2014 ' + hiddenCommunities.size + ' hidden \xb7 Reset?');
            }
            for (const nid of info.nodeIds) {
              const node = nodeMap.get(nid);
              if (node) node._hidden = !isHidden;
            }
            updateBlankGuard();
            renderDispatch();
          });
          item.addEventListener('mouseenter', ()=>{
            if(hiddenCommunities.size>0) return;
            for (const k2 of sortedKeys) {
              if (k2 === key) continue;
              for (const nid of communityMap.get(k2).nodeIds) {
                const node = nodeMap.get(nid);
                if (node) node._opacity = 0.15;
              }
            }
            renderDispatch();
          });
          item.addEventListener('mouseleave', ()=>{
            for (const n of nodes) n._opacity = 1;
            renderDispatch();
          });
          item.addEventListener('dblclick', ()=>{
            const hideOthers = !hiddenCommunities.has(key) || hiddenCommunities.size>1;
            if(hideOthers){
              sortedKeys.forEach(k=>{
                const it=[...legendEl.children].find(c=>c.textContent.includes(k));
                if(k===key){ hiddenCommunities.delete(k); it?.classList.remove('dimmed'); it?.setAttribute('aria-pressed','false'); }
                else{ hiddenCommunities.add(k); it?.classList.add('dimmed'); it?.setAttribute('aria-pressed','true'); }
              });
              for (const k2 of sortedKeys) {
                for (const nid of communityMap.get(k2).nodeIds) {
                  const node = nodeMap.get(nid);
                  if (node) node._hidden = (k2 !== key);
                }
              }
              updateBlankGuard();
              renderDispatch();
            }
          });
          legendEl.appendChild(item);
        });
        if(sortedKeys.length > MAX_LEGEND_VISIBLE){
          const toggle=document.createElement('button');
          toggle.type='button';
          toggle.className='ghost-btn';
          toggle.style.cssText='margin-top:6px;width:100%;justify-content:center';
          toggle.textContent = legendExpanded ? 'Show less' : `Show all ${sortedKeys.length} modules`;
          toggle.addEventListener('click', ()=>{ legendExpanded=!legendExpanded; renderLegend(); });
          legendEl.appendChild(toggle);
        }
      }
      renderLegend();

      // ─── 21b. File tree + Focused mode ────────────────────────
      const fileListEl = document.getElementById('file-tree');
      const fileSearchEl = document.getElementById('file-search');
      const btnGlobal = document.getElementById('btn-global');
      const filesTabBtn = document.querySelector('[data-tab="tab-files"]');
      const tabBtns = document.querySelectorAll('#sidebar-tabs button');
      const tabPanels = document.querySelectorAll('.tab-panel');

      // Tab switching
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.setAttribute('aria-selected', 'false'));
          tabPanels.forEach(p => p.classList.remove('is-active'));
          btn.setAttribute('aria-selected', 'true');
          document.getElementById(btn.dataset.tab).classList.add('is-active');
        });
      });

      // Collect file nodes and group by directory
      const fileNodes = nodes.filter(n => n._kind === 'file');
      const fileTree = {};
      for (const fn of fileNodes) {
        const parts = fn.id.split('/');
        const name = parts.pop();
        const dir = parts.join('/') || '.';
        if (!fileTree[dir]) fileTree[dir] = [];
        fileTree[dir].push({ id: fn.id, name, color: fn.color, degree: fn._degree });
      }
      const sortedDirs = Object.keys(fileTree).sort((a, b) => a.localeCompare(b));

      // Track collapsed directories
      const collapsedDirs = new Set();

      function renderFileTree(filter) {
        if (!fileListEl) return;
        fileListEl.innerHTML = '';
        const q = (filter || '').toLowerCase().trim();
        let totalCount = 0;

        for (const dir of sortedDirs) {
          const files = fileTree[dir];
          const filtered = q
            ? files.filter(f => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q))
            : files;
          if (!filtered.length) continue;
          totalCount += filtered.length;

          // Directory header
          const dirEl = document.createElement('div');
          dirEl.className = 'file-dir' + (collapsedDirs.has(dir) ? ' collapsed' : '');
          dirEl.innerHTML = '<span class="arrow" aria-hidden="true">▾</span><span class="dir-name">' + esc(dir === '.' ? '/' : dir) + '</span><span class="dir-count">' + filtered.length + '</span>';
          dirEl.addEventListener('click', () => {
            if (collapsedDirs.has(dir)) collapsedDirs.delete(dir);
            else collapsedDirs.add(dir);
            renderFileTree(fileSearchEl?.value);
          });
          fileListEl.appendChild(dirEl);

          if (!collapsedDirs.has(dir)) {
            for (const f of filtered) {
              const item = document.createElement('div');
              item.className = 'file-item' + (focusedFileId === f.id ? ' active' : '');
              item.dataset.fileId = f.id;
              item.innerHTML = '<span class="file-dot" style="background:' + esc(f.color) + '"></span><span class="file-name" title="' + esc(f.id) + '">' + esc(f.name) + '</span><span class="file-deps">' + f.degree + '</span>';
              item.addEventListener('click', () => enterFocusedMode(f.id));
              fileListEl.appendChild(item);
            }
          }
        }

        if (!totalCount && q) {
          fileListEl.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:11px;font-style:italic">No files matching "' + esc(q) + '"</div>';
        } else if (!totalCount) {
          fileListEl.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:11px;font-style:italic">No file nodes found</div>';
        }
      }
      renderFileTree();

      if (fileSearchEl) {
        fileSearchEl.addEventListener('input', () => renderFileTree(fileSearchEl.value));
      }

      function enterFocusedMode(fileId) {
        const neighbors = getNeighbors(fileId);
        focusedFileId = fileId;
        focusedNodeSet = new Set([fileId, ...neighbors]);

        // Filter links: only edges touching the selected file
        focusedLinks = links.filter(l => {
          const sid = typeof l.source === 'object' ? l.source.id : l.source;
          const tid = typeof l.target === 'object' ? l.target.id : l.target;
          return sid === fileId || tid === fileId;
        });

        // Create focused nodes array (clone positions from originals)
        const focusedNodes = [...focusedNodeSet].map(nid => {
          const orig = nodeMap.get(nid);
          return { ...orig, x: orig.x, y: orig.y, fx: null, fy: null };
        });

        // Stop global simulation
        simulation.stop();

        // Create focused simulation
        const fBoundaryRadius = Math.sqrt(focusedNodes.length) * 80;
        focusedSimulation = d3.forceSimulation(focusedNodes)
          .force('charge', d3.forceManyBody().strength(-300).distanceMax(400))
          .force('link', d3.forceLink(focusedLinks).id(d => d.id).distance(100).strength(0.6))
          .force('collide', d3.forceCollide().radius(d => d.radius + 6).strength(0.8))
          .force('center', d3.forceCenter(0, 0).strength(0.1))
          .force('boundary', forceBoundary(fBoundaryRadius))
          .alphaDecay(0.02)
          .velocityDecay(0.35)
          .on('tick', () => { renderDispatch(); if (drawMinimapRef) drawMinimapRef(); });

        // Update UI
        btnGlobal.style.display = '';
        filesTabBtn.innerHTML = 'Files <span class="tab-badge">FOCUSED</span>';

        // Auto-switch to Files tab
        tabBtns.forEach(b => b.setAttribute('aria-selected', 'false'));
        tabPanels.forEach(p => p.classList.remove('is-active'));
        filesTabBtn.setAttribute('aria-selected', 'true');
        document.getElementById('tab-files').classList.add('is-active');

        // Highlight selected in file tree
        document.querySelectorAll('.file-item').forEach(el => {
          el.classList.toggle('active', el.dataset.fileId === fileId);
        });

        // Show info
        selectedNode = nodeMap.get(fileId);
        showInfo(fileId);

        // Smooth zoom after brief settle
        setTimeout(() => fitFocusedView(), 600);

        const label = fileId.split('/').pop();
        showToast('Focused: ' + label);
      }

      function exitFocusedMode() {
        if (!focusedFileId) return;
        focusedFileId = null;
        focusedNodeSet = null;
        focusedLinks = null;

        if (focusedSimulation) {
          focusedSimulation.stop();
          focusedSimulation = null;
        }

        // Restore global simulation
        simulation.alpha(0.3).restart();

        // Update UI
        btnGlobal.style.display = 'none';
        filesTabBtn.textContent = 'Files';
        document.querySelectorAll('.file-item.active').forEach(el => el.classList.remove('active'));

        // Auto-switch to Node Info tab
        tabBtns.forEach(b => b.setAttribute('aria-selected', 'false'));
        tabPanels.forEach(p => p.classList.remove('is-active'));
        document.querySelector('[data-tab="tab-info"]').setAttribute('aria-selected', 'true');
        document.getElementById('tab-info').classList.add('is-active');

        // Update stats display
        metaEl.textContent = fileCount + ' files · ' + links.length + ' edges · ' + communityMap.size + ' modules';

        showToast('Global view');
      }

      function renderFocused() {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.translate(currentTransform.x, currentTransform.y);
        ctx.scale(currentTransform.k, currentTransform.k);

        const k = currentTransform.k;
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const fNodes = focusedSimulation ? focusedSimulation.nodes() : [];
        const fLinksList = focusedLinks || [];

        const hoveredId = hoveredNode ? hoveredNode.id : null;
        const selectedId = selectedNode ? selectedNode.id : null;
        const activeId = hoveredId || selectedId;
        const activeNeighbors = activeId ? getNeighbors(activeId) : null;

        // Draw edges
        for (const l of fLinksList) {
          const s = typeof l.source === 'object' ? l.source : null;
          const t = typeof l.target === 'object' ? l.target : null;
          if (!s || !t) continue;

          let alpha = 0.65;
          let lineWidth = l._isContains ? 1 : 2;
          let strokeColor = l._color || '#64748b';

          if (activeId) {
            const sid = s.id;
            const tid = t.id;
            if (sid === activeId || tid === activeId) {
              alpha = 0.95;
              lineWidth = l._isContains ? 1.5 : 3;
            } else {
              alpha = 0.15;
            }
          }

          ctx.globalAlpha = alpha;
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = lineWidth / k;

          if (l._isContains) {
            ctx.setLineDash([4 / k, 4 / k]);
          }

          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();

          if (l._isContains) ctx.setLineDash([]);

          // Arrow heads
          if (!l._isContains && k > 0.3) {
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const ux = dx / len;
              const uy = dy / len;
              const arrowLen = 7 / k;
              const arrowW = 3.5 / k;
              const tipX = t.x - ux * (t.radius + 2);
              const tipY = t.y - uy * (t.radius + 2);
              ctx.fillStyle = strokeColor;
              ctx.globalAlpha = alpha * 0.8;
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(tipX - ux * arrowLen + uy * arrowW, tipY - uy * arrowLen - ux * arrowW);
              ctx.lineTo(tipX - ux * arrowLen - uy * arrowW, tipY - uy * arrowLen + ux * arrowW);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        // Draw nodes
        for (const n of fNodes) {
          let nodeAlpha = 1;
          let glowRadius = 0;

          if (n.id === focusedFileId) {
            glowRadius = 16;
            nodeAlpha = 1;
          } else if (activeId) {
            if (n.id === activeId) {
              glowRadius = 12;
              nodeAlpha = 1;
            } else if (activeNeighbors && activeNeighbors.has(n.id)) {
              nodeAlpha = 0.9;
            } else {
              nodeAlpha = 0.3;
            }
          }

          ctx.globalAlpha = nodeAlpha;

          if (glowRadius > 0) {
            ctx.shadowColor = n.color;
            ctx.shadowBlur = glowRadius / k;
          }

          // Highlight the focused file with a ring
          if (n.id === focusedFileId) {
            ctx.strokeStyle = n.color;
            ctx.lineWidth = 2.5 / k;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + 4 / k, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          ctx.fill();

          if (glowRadius > 0) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }

          // Border ring for file/external
          if (n._kind === 'file' || n._kind === 'external') {
            ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 0.5 / k;
            ctx.stroke();
          }
        }

        // Draw labels
        const showLabelsThreshold = 0.3;
        if (k > showLabelsThreshold) {
          const labelAlphaBase = Math.min(1, (k - showLabelsThreshold) / 0.5);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          for (const n of fNodes) {
            let showLabel = false;
            let labelAlpha = labelAlphaBase;

            if (n.id === focusedFileId) {
              showLabel = true;
              labelAlpha = 1;
            } else if (n.id === activeId) {
              showLabel = true;
              labelAlpha = 1;
            } else if (activeNeighbors && activeNeighbors.has(n.id)) {
              showLabel = true;
              labelAlpha = 0.85;
            } else {
              showLabel = true;
              labelAlpha *= 0.8;
            }

            if (!showLabel) continue;

            const fontSize = Math.max(9, Math.min(14, 12)) / k;
            ctx.font = '500 ' + fontSize + 'px Inter, system-ui, sans-serif';
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle = isLight ? '#18181b' : '#e6e6eb';
            ctx.fillText(n.label, n.x, n.y + n.radius + 4 / k);
          }
        }

        ctx.restore();
      }

      function fitFocusedView() {
        if (!focusedSimulation) return;
        const fNodes = focusedSimulation.nodes();
        if (!fNodes.length) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of fNodes) {
          if (n.x < minX) minX = n.x;
          if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.y > maxY) maxY = n.y;
        }
        if (!isFinite(minX)) return;

        const pad = 80;
        const bw = maxX - minX + pad * 2;
        const bh = maxY - minY + pad * 2;
        const scale = Math.min(width / bw, height / bh, 3);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const t = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(scale)
          .translate(-cx, -cy);

        d3.select(canvas)
          .transition()
          .duration(500)
          .ease(d3.easeCubicInOut)
          .call(zoom.transform, t);
      }

      // Global button handler
      btnGlobal?.addEventListener('click', exitFocusedMode);

      // ─── 21c. Stats ─────────────────────────────────────────
      const totalEntities = classCount + funcCount + methodCount + entityCount;
      const statsEl=document.getElementById('stats');
      if(statsEl){
        const card = (val,label)=> '<div class="stat-card"><div class="stat-value">'+esc(String(val))+'</div><div class="stat-label">'+esc(label)+'</div></div>';
        statsEl.innerHTML = card(fileCount,'Files') + card(totalEntities,'Entities') + card(links.length,'Edges');
        const sub=document.createElement('div');
        sub.style.cssText='grid-column:1/-1;font-size:11px;color:var(--muted);margin-top:2px';
        sub.textContent = classCount+' classes \xb7 '+funcCount+' functions \xb7 '+methodCount+' methods \xb7 '+communityMap.size+' modules';
        statsEl.appendChild(sub);
      }

      // ─── 22. Filters ──────────────────────────────────────────
      const depNodeIds = nodes.filter(n => n._npm).map(n => n.id);
      const entityNodeIds = nodes.filter(n => ['entity', 'class', 'function', 'method', 'dependency', 'pkg-category', 'pkg-metadata', 'keyword', 'script', 'heading'].includes(n._kind)).map(n => n.id);
      document.getElementById('dep-count').textContent = depNodeIds.length;
      document.getElementById('entity-count').textContent = entityNodeIds.length;
      const hiddenFilters = {};

      document.getElementById('toggle-deps').addEventListener('click', function () {
        const isHidden = hiddenFilters.deps;
        hiddenFilters.deps = !isHidden;
        this.setAttribute('aria-pressed', String(!isHidden));
        this.classList.toggle('is-active', !isHidden);
        for (const id of depNodeIds) {
          const n = nodeMap.get(id);
          if (n) n._hidden = !isHidden;
        }
        showToast(isHidden ? 'Showing dependencies' : 'Hid dependencies');
        updateBlankGuard();
        renderDispatch();
      });
      document.getElementById('toggle-entities').addEventListener('click', function () {
        const isHidden = hiddenFilters.entities;
        hiddenFilters.entities = !isHidden;
        this.setAttribute('aria-pressed', String(!isHidden));
        this.classList.toggle('is-active', !isHidden);
        for (const id of entityNodeIds) {
          const n = nodeMap.get(id);
          if (n) n._hidden = !isHidden;
        }
        showToast(isHidden ? 'Showing entities' : 'Hid entities');
        updateBlankGuard();
        renderDispatch();
      });
      document.getElementById('btn-reset-filters')?.addEventListener('click', ()=>{
        hiddenFilters.deps=false; hiddenFilters.entities=false;
        document.getElementById('toggle-deps').setAttribute('aria-pressed','false');
        document.getElementById('toggle-deps').classList.remove('is-active');
        document.getElementById('toggle-entities').setAttribute('aria-pressed','false');
        document.getElementById('toggle-entities').classList.remove('is-active');
        hiddenCommunities.clear();
        [...legendEl.children].forEach(c=>{c.classList.remove('dimmed'); c.setAttribute('aria-pressed','false');});
        for (const n of nodes) { n._hidden = false; n._opacity = 1; }
        document.getElementById('blank-guard').style.display='none';
        showToast('Reset filters');
        renderDispatch();
      });

      // ─── 23. Info panel ────────────────────────────────────────
      function showInfo(nodeId) {
        const n = nodeMap.get(nodeId);
        if (!n) return;
        const neighborIds = [...getNeighbors(nodeId)];
        const neighborHtml = neighborIds.map(nid => {
          const nb = nodeMap.get(nid);
          const label = nb ? nb.label : nid;
          const color = nb ? nb.color : '#555';
          return '<button type="button" class="neighbor-link" style="border-inline-start:1px solid ' + esc(color) + '" data-nid="' + esc(nid) + '">' + esc(label) + '</button>';
        }).join('');

        let extra = '';
        let moduleLabel = esc(n._community || '-');
        let kindChip = '<span class="kind-chip">'+ esc(n._kind) +'</span>';
        if (['entity', 'class', 'function', 'method'].includes(n._kind)) {
          const sepIdx = nodeId.lastIndexOf('::');
          const parentFile = sepIdx !== -1 ? nodeId.slice(0, sepIdx) : nodeId;
          moduleLabel = 'entities';
          extra = '<div class="field">Defined in: <span style="font-family:Geist Mono,monospace;font-size:11px;word-break:break-all">' + esc(parentFile) + '</span></div>';
        } else if (n._kind === 'pkg-metadata') {
          moduleLabel = 'package-config';
          const rawNode = data.nodes.find(d => d.key === nodeId);
          if (rawNode && rawNode.attributes.metaField) {
            extra = '<div class="field">' + esc(rawNode.attributes.metaField) + ': <span style="font-family:Geist Mono,monospace;font-size:11px;word-break:break-all">' + esc(rawNode.attributes.metaValue || '') + '</span></div>';
          }
        } else if (n._kind === 'pkg-category') {
          moduleLabel = 'package-config';
          const rawNode = data.nodes.find(d => d.key === nodeId);
          if (rawNode && rawNode.attributes.depCategory) {
            extra = '<div class="field">Category: <span style="font-family:Geist Mono,monospace;font-size:11px">' + esc(rawNode.attributes.depCategory) + '</span></div>';
          }
        } else if (n._kind === 'dependency') {
          moduleLabel = 'dependencies';
          const rawNode = data.nodes.find(d => d.key === nodeId);
          if (rawNode && rawNode.attributes.version) {
            extra = '<div class="field">Version: <span style="font-family:Geist Mono,monospace;font-size:11px">' + esc(rawNode.attributes.version) + '</span></div>';
          }
          if (rawNode && rawNode.attributes.depType) {
            extra += '<div class="field">Type: <span style="font-family:Geist Mono,monospace;font-size:11px">' + esc(rawNode.attributes.depType) + '</span></div>';
          }
        } else if (n._kind === 'keyword') {
          moduleLabel = 'package-config';
        } else if (n._kind === 'script') {
          moduleLabel = 'package-config';
          const rawNode = data.nodes.find(d => d.key === nodeId);
          if (rawNode && rawNode.attributes.scriptCommand) {
            extra = '<div class="field">Command: <span style="font-family:Geist Mono,monospace;font-size:11px;word-break:break-all">' + esc(rawNode.attributes.scriptCommand) + '</span></div>';
          }
        } else if (n._kind === 'heading') {
          moduleLabel = 'documentation';
          const rawNode = data.nodes.find(d => d.key === nodeId);
          if (rawNode && rawNode.attributes.headingLevel) {
            extra = '<div class="field">Level: <span style="font-family:Geist Mono,monospace;font-size:11px">H' + esc(String(rawNode.attributes.headingLevel)) + '</span></div>';
          }
        }

        document.getElementById('info-content').innerHTML =
          '<div class="field"><b>' + esc(n.label) + '</b>' + kindChip + '</div>' +
          '<div class="field">Module: ' + moduleLabel + '</div>' +
          extra +
          '<div class="field">Connections: ' + neighborIds.length + ' \xb7 Degree ' + (n._degree||0) + '</div>' +
          (neighborIds.length
            ? '<div style="margin-top:8px;color:var(--muted);font-size:11px">Neighbors \u2014 click to focus</div><div id="neighbors-list">' + neighborHtml + '</div>'
            : '<div style="margin-top:8px;color:var(--muted-2);font-size:11px">No neighbors</div>');

        const meta=document.getElementById('info-meta');
        if(meta){
          meta.innerHTML = '<span class="meta-pill">'+esc(n._language||'file')+'</span><span class="meta-pill">'+esc(n._community||'other')+'</span><span class="meta-pill">deg '+ (n._degree||0) +'</span>';
        }
        const copyBtn=document.getElementById('btn-copy-path');
        if(copyBtn){ copyBtn.onclick= async ()=>{ try{ await navigator.clipboard.writeText(nodeId); copyBtn.textContent='Copied'; copyBtn.setAttribute('aria-live','polite'); showToast('Copied path'); setTimeout(()=>copyBtn.textContent='Copy',1200);}catch{ copyBtn.textContent='\u2014'; showToast('Copy failed'); }}; }

        document.querySelectorAll('.neighbor-link').forEach(el => {
          el.addEventListener('click', () => {
            const nid = el.getAttribute('data-nid');
            const nbNode = nodeMap.get(nid);
            // In focused mode, clicking a file neighbor switches focus
            if (focusedFileId && nbNode && nbNode._kind === 'file' && nid !== focusedFileId) {
              enterFocusedMode(nid);
            } else {
              focusNode(nid, 1.4);
              selectedNode = nodeMap.get(nid);
              showInfo(nid);
              renderDispatch();
            }
          });
        });
      }

      // ─── 24. Minimap ──────────────────────────────────────────
      let minimapVisible = true;
      let minimapAnimating = false;
      let drawMinimapRef = null; // set by setupMinimap

      function setupMinimap() {
        const wrap = document.getElementById('minimap-wrap');
        const mmCanvas = document.getElementById('minimap');
        const mmCtx = mmCanvas.getContext('2d');
        let ro = null;

        function syncSize(){
          const mmDpr = window.devicePixelRatio || 1;
          const rect = wrap.getBoundingClientRect();
          const w = rect.width, h = rect.height;
          if (w === 0 || h === 0) return {w:0,h:0,dpr:mmDpr};
          mmCanvas.width = w * mmDpr;
          mmCanvas.height = h * mmDpr;
          mmCanvas.style.width = w + 'px';
          mmCanvas.style.height = h + 'px';
          return {w,h,dpr:mmDpr};
        }
        let dims = syncSize();
        if(window.ResizeObserver){
          ro = new ResizeObserver(()=>{ dims=syncSize(); drawMinimap(); });
          ro.observe(wrap);
        }
        window.addEventListener('resize', ()=>{ dims=syncSize(); drawMinimap(); });

        let prevMinX, prevMinY, prevRangeX, prevRangeY;
        function computeBounds() {
          const boundsNodes = focusedSimulation ? focusedSimulation.nodes() : nodes;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const n of boundsNodes) {
            if (n._hidden) continue;
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
          }
          if (!isFinite(minX)) return false;
          const pad = 0.05;
          const padX = (maxX - minX) * pad || 50;
          const padY = (maxY - minY) * pad || 50;
          prevMinX = minX - padX;
          prevMinY = minY - padY;
          prevRangeX = (maxX - minX) + padX * 2;
          prevRangeY = (maxY - minY) + padY * 2;
          return true;
        }
        function toX(nx) { return ((nx - prevMinX) / prevRangeX) * dims.w; }
        function toY(ny) { return ((ny - prevMinY) / prevRangeY) * dims.h; }

        function drawMinimap() {
          if(!dims.w) dims=syncSize();
          mmCtx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
          mmCtx.clearRect(0, 0, dims.w, dims.h);
          if (!computeBounds()) return;

          const mmNodes = focusedSimulation ? focusedSimulation.nodes() : nodes;
          const mmLinks = focusedLinks || links;

          // Draw edges
          mmCtx.globalAlpha = 0.12;
          mmCtx.lineWidth = 0.5;
          for (const l of mmLinks) {
            const s = typeof l.source === 'object' ? l.source : nodeMap.get(l.source);
            const t = typeof l.target === 'object' ? l.target : nodeMap.get(l.target);
            if (!s || !t || s._hidden || t._hidden) continue;
            mmCtx.strokeStyle = s.color || '#64748b';
            mmCtx.beginPath();
            mmCtx.moveTo(toX(s.x), toY(s.y));
            mmCtx.lineTo(toX(t.x), toY(t.y));
            mmCtx.stroke();
          }

          // Draw nodes
          mmCtx.globalAlpha = 0.3;
          const nodeR = Math.max(0.6, Math.min(1.2, 1.2 - ((mmNodes.length - 50) / 450) * 0.6));
          for (const n of mmNodes) {
            if (n._hidden) continue;
            mmCtx.beginPath();
            mmCtx.arc(toX(n.x), toY(n.y), nodeR, 0, Math.PI * 2);
            mmCtx.fillStyle = n.color;
            mmCtx.fill();
          }

          // Draw viewport rectangle
          mmCtx.globalAlpha = 1;
          const inv = currentTransform.invert([0, 0]);
          const inv2 = currentTransform.invert([width, height]);
          const rx = toX(inv[0]);
          const ry = toY(inv[1]);
          const rw = toX(inv2[0]) - rx;
          const rh = toY(inv2[1]) - ry;
          const isLight = document.documentElement.getAttribute('data-theme') === 'light';
          mmCtx.strokeStyle = isLight ? 'rgba(18,18,27,0.35)' : 'rgba(255,255,255,0.55)';
          mmCtx.lineWidth = 1.2;
          mmCtx.strokeRect(rx, ry, rw, rh);
          mmCtx.fillStyle = isLight ? 'rgba(18,18,27,0.04)' : 'rgba(255,255,255,0.06)';
          mmCtx.fillRect(rx, ry, rw, rh);
        }
        drawMinimapRef = drawMinimap;

        // Sync minimap on every frame
        simulation.on('tick.minimap', drawMinimap);

        // Also redraw on zoom
        const origZoomHandler = zoom.on('zoom');
        zoom.on('zoom', (event) => {
          currentTransform = event.transform;
          renderDispatch();
          drawMinimap();
        });

        drawMinimap();

        // Minimap zoom buttons
        document.getElementById('minimap-zoom-in')?.addEventListener('click', ()=>{
          d3.select(canvas)
            .transition()
            .duration(300)
            .call(zoom.scaleBy, 1.25);
        });
        document.getElementById('minimap-zoom-out')?.addEventListener('click', ()=>{
          d3.select(canvas)
            .transition()
            .duration(300)
            .call(zoom.scaleBy, 0.8);
        });

        // Minimap click-to-navigate
        let isDragging = false;
        mmCanvas.addEventListener('mousedown', (e) => {
          if (minimapAnimating || !prevRangeX) return;
          const r = mmCanvas.getBoundingClientRect();
          const mx = Math.max(0, Math.min(dims.w, (e.clientX - r.left) * (dims.w / r.width)));
          const my = Math.max(0, Math.min(dims.h, (e.clientY - r.top) * (dims.h / r.height)));
          const nx = ((mx / dims.w) * prevRangeX) + prevMinX;
          const ny = ((my / dims.h) * prevRangeY) + prevMinY;
          isDragging = true;
          mmCanvas.style.cursor = 'grabbing';

          const t = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(currentTransform.k)
            .translate(-nx, -ny);
          minimapAnimating = true;
          d3.select(canvas)
            .transition()
            .duration(400)
            .ease(d3.easeCubicInOut)
            .call(zoom.transform, t)
            .on('end', () => { minimapAnimating = false; drawMinimap(); });
        });
        document.addEventListener('mousemove', (e) => {
          if (!isDragging || !prevRangeX) return;
          const r = mmCanvas.getBoundingClientRect();
          const mx = Math.max(0, Math.min(dims.w, (e.clientX - r.left) * (dims.w / r.width)));
          const my = Math.max(0, Math.min(dims.h, (e.clientY - r.top) * (dims.h / r.height)));
          const nx = ((mx / dims.w) * prevRangeX) + prevMinX;
          const ny = ((my / dims.h) * prevRangeY) + prevMinY;
          const t = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(currentTransform.k)
            .translate(-nx, -ny);
          d3.select(canvas)
            .transition()
            .duration(200)
            .call(zoom.transform, t);
        });
        document.addEventListener('mouseup', () => {
          if (isDragging) { isDragging = false; mmCanvas.style.cursor = 'pointer'; }
        });
        wrap.addEventListener('mouseenter', () => { mmCanvas.style.cursor = 'pointer'; });
        wrap.addEventListener('mouseleave', () => { if (!isDragging) mmCanvas.style.cursor = 'default'; });
      }

      // ─── 25. Keyboard shortcuts ────────────────────────────────
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Escape') {
          if (sidebar.classList.contains('is-open')) {
            sidebar.classList.remove('is-open');
            document.getElementById('btn-menu')?.setAttribute('aria-expanded','false');
          } else if (focusedFileId) {
            exitFocusedMode();
          }
        }
        if (e.key === 'm' || e.key === 'M') {
          minimapVisible = !minimapVisible;
          document.getElementById('minimap-wrap').classList.toggle('minimap-hidden', !minimapVisible);
        }
        if (e.key === 'g' || e.key === 'G') {
          if (focusedFileId) exitFocusedMode();
        }
      });

      // ─── 26. Cycles (non-blocking) ─────────────────────────────
      loadCycles();

      async function loadCycles() {
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
          document.getElementById('cycles-list').innerHTML = '<div class="search-item" style="padding-left:8px;color:var(--muted);font-style:italic;">No cycles detected</div>';
          return;
        }

        const cycleState = { active: false, cycles, cycleNodeIds: new Set(), cycleEdgeIds: new Set() };

        for (const c of cycleState.cycles) {
          for (const f of c.files) cycleState.cycleNodeIds.add(f.id);
          for (const e of c.edges) cycleState.cycleEdgeIds.add(e.from + '|' + e.to);
        }

        const cyclesList = document.getElementById('cycles-list');
        for (const c of cycleState.cycles) {
          const item = document.createElement('button');
          item.type='button';
          item.className = 'cycle-item';
          item.textContent = c.label;
          item.addEventListener('click', () => focusCycle(c));
          cyclesList.appendChild(item);
        }

        document.getElementById('toggle-cycles').addEventListener('click', function () {
          cycleState.active = !cycleState.active;
          this.setAttribute('aria-pressed', String(cycleState.active));
          this.classList.toggle('is-active', cycleState.active);

          // Update link highlighting for cycle edges
          for (const l of links) {
            const sid = typeof l.source === 'object' ? l.source.id : l.source;
            const tid = typeof l.target === 'object' ? l.target.id : l.target;
            const edgeKey = sid + '|' + tid;
            if (cycleState.cycleEdgeIds.has(edgeKey)) {
              if (cycleState.active) {
                l._color = '#ef4444';
                l._opacity = 0.9;
                l._width = 3;
              } else {
                const srcNode = nodeMap.get(sid);
                l._color = srcNode ? srcNode.color : '#64748b';
                l._opacity = 0.25;
                l._width = l._isContains ? 0.5 : 1.2;
              }
            }
          }

          // Dim non-cycle nodes
          for (const n of nodes) {
            if (cycleState.cycleNodeIds.has(n.id)) {
              n._opacity = cycleState.active ? 1 : 1;
            } else if (cycleState.active) {
              n._opacity = 0.15;
            } else {
              n._opacity = 1;
            }
          }

          if (cycleState.active && cycleState.cycles.length) {
            const firstId = cycleState.cycles[0].files[0]?.id;
            if (firstId) focusNode(firstId, 1.2);
          }
          renderDispatch();
        });

        function focusCycle(cycle) {
          if (!cycleState.active) {
            document.getElementById('toggle-cycles').click();
          }
          const firstId = cycle.files[0]?.id;
          if (firstId) focusNode(firstId, 1.3);
        }
      }
    }

    boot().catch(err => {
      console.error('Graph boot error:', err);
      document.getElementById('loading-overlay').innerHTML =
        '<span style="color:var(--accent-cycles)">Error loading graph: ' + esc(err.message) + '</span><button type="button" class="ghost-btn" style="margin-top:12px" onclick="location.reload()">Retry</button>';
    });
