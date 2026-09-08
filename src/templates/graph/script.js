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

      // 1. Fetch graph data (with 30s timeout)
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

      // Toolbar helpers
      const metaEl = document.getElementById('graph-meta');
      if(metaEl) metaEl.textContent = fileCount + ' files · ' + rawEdges.length + ' edges · ' + communityMap.size + ' modules';
      document.getElementById('btn-fit')?.addEventListener('click', ()=> network.fit({animation:{duration:400, easingFunction:'easeInOutQuad'}}));
      document.getElementById('btn-reheat')?.addEventListener('click', (e)=>{
        const btn=e.currentTarget;
        btn.setAttribute('aria-busy','true');
        showToast('Reheating…');
        network.setOptions({physics:{enabled:true}});
        setTimeout(()=>{ network.setOptions({physics:{enabled:false}}); btn.removeAttribute('aria-busy'); showToast('Layout settled'); }, 1800);
      });
      const btnMenu=document.getElementById('btn-menu');
      const sidebar=document.getElementById('sidebar');
      btnMenu?.addEventListener('click', ()=>{
        const open=sidebar.classList.toggle('is-open');
        btnMenu.setAttribute('aria-expanded', String(open));
      });
      document.getElementById('graph-container')?.addEventListener('click', ()=>{
        if(window.innerWidth<=900 && sidebar.classList.contains('is-open')){ sidebar.classList.remove('is-open'); btnMenu?.setAttribute('aria-expanded','false'); }
      });
      document.addEventListener('keydown', (e)=>{
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
        const hidden = nodesDS.get().filter(n=> n.hidden).length;
        const guard=document.getElementById('blank-guard');
        if(!guard) return;
        if(hidden >= rawNodes.length && rawNodes.length>0){ guard.style.display='flex'; }
        else guard.style.display='none';
      }
      document.getElementById('btn-reset-from-blank')?.addEventListener('click', ()=> document.getElementById('btn-reset-filters')?.click());

      let t0=performance.now();
      // 8. Freeze physics, then setup minimap with final positions
      network.once('stabilizationIterationsDone', () => {
        const dt=Math.round(performance.now()-t0);
        network.setOptions({ physics: { enabled: false } });
        setupMinimap();
        document.getElementById('minimap-wrap').classList.remove('minimap-hidden');
        showToast('Stabilized in ' + dt + 'ms · ' + rawNodes.length + ' nodes');
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
        const connectedEdges = network.getConnectedEdges(params.node);
        const edgeUpdates = [];
        for (const edgeId of connectedEdges) {
          edgeUpdates.push({ id: edgeId, width: 5, color: { opacity: 0.9 } });
        }
        edgesDS.update(edgeUpdates);
        boldedEdges = new Set(connectedEdges);
        const nd = nodesDS.get(params.node);
        if (nd && ['entity', 'class', 'function', 'method'].includes(nd._kind)) {
          nodesDS.update({ id: params.node, font: { size: 10, color: '#ffffff', face: 'Inter, sans-serif' } });
        }
      });
      network.on('blurNode', () => {
        const edgeUpdates = [];
        for (const edgeId of boldedEdges) {
          const origWidth = edgeOriginalWidth[edgeId] ?? 2;
          edgeUpdates.push({ id: edgeId, width: origWidth, color: { opacity: 0.55 } });
        }
        edgesDS.update(edgeUpdates);
        boldedEdges = new Set();
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
          document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect · hover to preview</span>';
          document.getElementById('info-meta').innerHTML='';
        }
      });

      // 12. Search — Operate premium
      const searchInput = document.getElementById('search');
      const searchResults = document.getElementById('search-results');
      const searchClear = document.getElementById('search-clear');
      const allNodeLabels = rawNodes.map(n => ({ id: n.id, label: n.label, color: n.color.background, community: n._community, kind: n._kind }));
      let activeIdx = -1;
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
          searchResults.innerHTML = '<div class="search-item" style="pointer-events:none;color:var(--muted)">No results for “' + esc(q) + '”</div>';
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
            network.focus(n.id, { scale: 1.4, animation: true });
            network.selectNodes([n.id]);
            showInfo(n.id);
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
          moreEl.textContent = '+' + more + ' more — keep typing to narrow';
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

      // 13. Legend
      const legendEl = document.getElementById('legend');
      const legendCount = document.getElementById('legend-count');
      if(legendCount) legendCount.textContent = communityMap.size + ' modules';
      const hiddenCommunities = new Set();
      const keysToSkip = new Set(['dependencies', 'entities']);
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
              showToast('Hid ' + key + ' — ' + hiddenCommunities.size + ' hidden · Reset?');
            }
            const update = info.nodeIds.map(nid => ({ id: nid, hidden: !isHidden }));
            nodesDS.update(update);
            updateBlankGuard();
          });
          item.addEventListener('mouseenter', ()=>{
            if(hiddenCommunities.size>0) return;
            const otherIds = sortedKeys.filter(k=>k!==key).flatMap(k=> communityMap.get(k).nodeIds);
            nodesDS.update(otherIds.map(id=>({id, opacity:0.2})));
          });
          item.addEventListener('mouseleave', ()=>{
            nodesDS.update(rawNodes.map(n=>({id:n.id, opacity: undefined})));
          });
          item.addEventListener('dblclick', ()=>{
            const hideOthers = !hiddenCommunities.has(key) || hiddenCommunities.size>1;
            if(hideOthers){
              sortedKeys.forEach(k=>{
                const it=[...legendEl.children].find(c=>c.textContent.includes(k));
                if(k===key){ hiddenCommunities.delete(k); it?.classList.remove('dimmed'); it?.setAttribute('aria-pressed','false'); }
                else{ hiddenCommunities.add(k); it?.classList.add('dimmed'); it?.setAttribute('aria-pressed','true'); }
              });
              const updates=[];
              for(const k of sortedKeys){ const inf=communityMap.get(k); updates.push(...inf.nodeIds.map(nid=>({id:nid, hidden: k!==key}))); }
              nodesDS.update(updates);
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

      const totalEntities = classCount + funcCount + methodCount + entityCount;
      const statsEl=document.getElementById('stats');
      if(statsEl){
        const card = (val,label)=> '<div class="stat-card"><div class="stat-value">'+esc(String(val))+'</div><div class="stat-label">'+esc(label)+'</div></div>';
        statsEl.innerHTML = card(fileCount,'Files') + card(totalEntities,'Entities') + card(rawEdges.length,'Edges');
        const sub=document.createElement('div');
        sub.style.cssText='grid-column:1/-1;font-size:11px;color:var(--muted);margin-top:2px';
        sub.textContent = classCount+' classes · '+funcCount+' functions · '+methodCount+' methods · '+communityMap.size+' modules';
        statsEl.appendChild(sub);
      }

      // 14. Filters — toggle dependencies and entities
      const depNodeIds = rawNodes.filter(n => n._npm).map(n => n.id);
      const entityNodeIds = rawNodes.filter(n => ['entity', 'class', 'function', 'method'].includes(n._kind)).map(n => n.id);
      document.getElementById('dep-count').textContent = depNodeIds.length;
      document.getElementById('entity-count').textContent = entityNodeIds.length;
      const hiddenFilters = {};
      document.getElementById('toggle-deps').addEventListener('click', function () {
        const isHidden = hiddenFilters.deps;
        hiddenFilters.deps = !isHidden;
        this.setAttribute('aria-pressed', String(!isHidden));
        this.classList.toggle('is-active', !isHidden);
        nodesDS.update(depNodeIds.map(id => ({ id, hidden: !isHidden })));
        showToast(isHidden ? 'Showing dependencies' : 'Hid dependencies');
        updateBlankGuard();
      });
      document.getElementById('toggle-entities').addEventListener('click', function () {
        const isHidden = hiddenFilters.entities;
        hiddenFilters.entities = !isHidden;
        this.setAttribute('aria-pressed', String(!isHidden));
        this.classList.toggle('is-active', !isHidden);
        nodesDS.update(entityNodeIds.map(id => ({ id, hidden: !isHidden })));
        showToast(isHidden ? 'Showing entities' : 'Hid entities');
        updateBlankGuard();
      });
      document.getElementById('btn-reset-filters')?.addEventListener('click', ()=>{
        hiddenFilters.deps=false; hiddenFilters.entities=false;
        document.getElementById('toggle-deps').setAttribute('aria-pressed','false');
        document.getElementById('toggle-deps').classList.remove('is-active');
        document.getElementById('toggle-entities').setAttribute('aria-pressed','false');
        document.getElementById('toggle-entities').classList.remove('is-active');
        hiddenCommunities.clear();
        [...legendEl.children].forEach(c=>{c.classList.remove('dimmed'); c.setAttribute('aria-pressed','false');});
        const updates=[...rawNodes.map(n=>({id:n.id, hidden:false, opacity:undefined}))];
        nodesDS.update(updates);
        document.getElementById('blank-guard').style.display='none';
        showToast('Reset filters');
      });

      // 15. Info panel — Operate premium
      function showInfo(nodeId) {
        const n = nodesDS.get(nodeId);
        if (!n) return;
        const neighborIds = network.getConnectedNodes(nodeId);
        const neighborHtml = neighborIds.map(nid => {
          const nb = nodesDS.get(nid);
          const label = nb ? nb.label : nid;
          const color = nb ? nb.color.background : '#555';
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
        }

        document.getElementById('info-content').innerHTML =
          '<div class="field"><b>' + esc(n.label) + '</b>' + kindChip + '</div>' +
          '<div class="field">Module: ' + moduleLabel + '</div>' +
          extra +
          '<div class="field">Connections: ' + neighborIds.length + ' · Degree ' + (n._degree||0) + '</div>' +
          (neighborIds.length
            ? '<div style="margin-top:8px;color:var(--muted);font-size:11px">Neighbors — click to focus</div><div id="neighbors-list">' + neighborHtml + '</div>'
            : '<div style="margin-top:8px;color:var(--muted-2);font-size:11px">No neighbors</div>');

        const meta=document.getElementById('info-meta');
        if(meta){
          meta.innerHTML = '<span class="meta-pill">'+esc(n._language||'file')+'</span><span class="meta-pill">'+esc(n._community||'other')+'</span><span class="meta-pill">deg '+ (n._degree||0) +'</span>';
        }
        // copy path — aria-live
        const copyBtn=document.getElementById('btn-copy-path');
        if(copyBtn){ copyBtn.onclick= async ()=>{ try{ await navigator.clipboard.writeText(nodeId); copyBtn.textContent='Copied'; copyBtn.setAttribute('aria-live','polite'); showToast('Copied path'); setTimeout(()=>copyBtn.textContent='Copy',1200);}catch{ copyBtn.textContent='—'; showToast('Copy failed'); }}; }

        document.querySelectorAll('.neighbor-link').forEach(el => {
          el.addEventListener('click', () => {
            const nid = el.getAttribute('data-nid');
            network.focus(nid, { scale: 1.4, animation: true });
            network.selectNodes([nid]);
            showInfo(nid);
          });
        });
      }

      let minimapVisible = true;
      let minimapAnimating = false;
      function setupMinimap() {
        const wrap = document.getElementById('minimap-wrap');
        const canvas = document.getElementById('minimap');
        const ctx = canvas.getContext('2d');
        let ro=null;

        function syncSize(){
          const dpr = window.devicePixelRatio || 1;
          const rect = wrap.getBoundingClientRect();
          const w = rect.width, h = rect.height;
          if (w === 0 || h === 0) return {w:0,h:0,dpr};
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          canvas.style.width = w + 'px';
          canvas.style.height = h + 'px';
          return {w,h,dpr};
        }
        let dims=syncSize();
        if(window.ResizeObserver){
          ro=new ResizeObserver(()=>{ dims=syncSize(); draw(); });
          ro.observe(wrap);
        }
        window.addEventListener('resize', ()=>{ dims=syncSize(); draw(); });

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
        function toX(nx) { return ((nx - prevMinX) / prevRangeX) * dims.w; }
        function toY(ny) { return ((ny - prevMinY) / prevRangeY) * dims.h; }

        function draw() {
          if(!dims.w) dims=syncSize();
          ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
          ctx.clearRect(0, 0, dims.w, dims.h);
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
            // skip hidden nodes (respect filters)
            const ds = nodesDS.get(n.id);
            if(ds && ds.hidden) continue;
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
          const rw = (vw / prevRangeX) * dims.w;
          const rh = (vh / prevRangeY) * dims.h;
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          if(document.documentElement.getAttribute('data-theme')==='light') ctx.strokeStyle='rgba(18,18,27,0.35)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(rx, ry, rw, rh);
        }

        draw();
        network.on('afterDrawing', draw);
        document.getElementById('minimap-zoom-in')?.addEventListener('click', ()=>{ network.moveTo({scale: network.getScale()*1.25, animation:{duration:300}}); });
        document.getElementById('minimap-zoom-out')?.addEventListener('click', ()=>{ network.moveTo({scale: network.getScale()*0.8, animation:{duration:300}}); });

        let isDragging = false;
        canvas.addEventListener('mousedown', (e) => {
          if (minimapAnimating) return;
          if (!prevRangeX) return;
          const r = canvas.getBoundingClientRect();
          const mx = Math.max(0, Math.min(dims.w, (e.clientX - r.left) * (dims.w / r.width)));
          const my = Math.max(0, Math.min(dims.h, (e.clientY - r.top) * (dims.h / r.height)));
          const nx = ((mx / dims.w) * prevRangeX) + prevMinX;
          const ny = ((my / dims.h) * prevRangeY) + prevMinY;
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
          const mx = Math.max(0, Math.min(dims.w, (e.clientX - r.left) * (dims.w / r.width)));
          const my = Math.max(0, Math.min(dims.h, (e.clientY - r.top) * (dims.h / r.height)));
          const nx = ((mx / dims.w) * prevRangeX) + prevMinX;
          const ny = ((my / dims.h) * prevRangeY) + prevMinY;
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

      // M key toggle + Esc closes mobile drawer
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('is-open')){ sidebar.classList.remove('is-open'); document.getElementById('btn-menu')?.setAttribute('aria-expanded','false'); }
        if (e.key === 'm' || e.key === 'M') {
          if (e.target.tagName === 'INPUT') return;
          minimapVisible = !minimapVisible;
          document.getElementById('minimap-wrap').classList.toggle('minimap-hidden', !minimapVisible);
        }
      });

      // Sidebar mobile toggle (if you add a hamburger later, hook here)
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
      });

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
        '<span style="color:var(--accent-cycles)">Error loading graph: ' + esc(err.message) + '</span><button type="button" class="ghost-btn" style="margin-top:12px" onclick="location.reload()">Retry</button>';
    });
