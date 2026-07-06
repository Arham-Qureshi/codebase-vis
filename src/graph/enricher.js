function setAttrs(graph, node, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    graph.setNodeAttribute(node, key, value);
  }
}

//assigns structural metadata ,used to beautify the data for visualisation
export function enrichNodes(graph) {
  graph.forEachNode((node, attributes) => {
    // external npm dependencies
    if (attributes.external) {
      setAttrs(graph, node, { layer: 'External', type: 'npm', color: '#64748B' });
      return;
    }

    // Helper to check if the node path matches a given regex pattern
    const has = (pattern) => pattern.test(node);

    // Apply specific layers and colors based on standard architectural path patterns
    if (has(/\/api\//) || has(/\/routes\//) || has(/\.controller\./)) {
      setAttrs(graph, node, { layer: 'Backend', type: 'api', color: '#10B981' }); // Green for Backend
    } else if (has(/\/components\//) || has(/\/views\//) || has(/\.tsx/)) {
      setAttrs(graph, node, { layer: 'Frontend', type: 'ui', color: '#3B82F6' }); // Blue for UI
    } else if (has(/\/db\//) || has(/\/schema\//) || has(/\.model\./)) {
      setAttrs(graph, node, { layer: 'Database', type: 'database', color: '#F59E0B' }); // Orange for DB
    } else {
      setAttrs(graph, node, { layer: 'Core', type: 'module', color: '#94A3B8' }); // Default Gray for internal Core
    }
  });
}