import path from 'node:path';

function setAttrs(graph, node, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    graph.setNodeAttribute(node, key, value);
  }
}

export function enrichNodes(graph) {
  graph.forEachNode((node, attributes) => {
    // Sigma.js requires x, y, size, and label properties to render!
    const baseAttrs = {
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.max(5, Math.min(15, graph.degree(node))), // Size based on connection count
      label: attributes.label || path.basename(node)
    };
    setAttrs(graph, node, baseAttrs);

    // external npm dependencies
    if (attributes.external) {
      setAttrs(graph, node, { layer: 'External', nodeType: 'npm', color: '#64748B' });
      return;
    }

    // Helper to check if the node path matches a given regex pattern
    const has = (pattern) => pattern.test(node);

    // Apply specific layers and colors based on standard architectural path patterns
    // by using 'has' function that checks if the node path matches a given regex pattern
    if (has(/\/api\//) || has(/\/routes\//) || has(/\.controller\./)) {
      setAttrs(graph, node, { layer: 'Backend', nodeType: 'api', color: '#10B981' }); // Green for Backend
    }
    else if (has(/\/components\//) || has(/\/views\//) || has(/\.tsx/)) {
      setAttrs(graph, node, { layer: 'Frontend', nodeType: 'ui', color: '#3B82F6' }); // Blue for UI
    }
    else if (has(/\/db\//) || has(/\/schema\//) || has(/\.model\./)) {
      setAttrs(graph, node, { layer: 'Database', nodeType: 'database', color: '#F59E0B' }); // Orange for DB
    }
    else {
      setAttrs(graph, node, { layer: 'Core', nodeType: 'module', color: '#94A3B8' }); // Default Gray for internal Core
    }
  });
}