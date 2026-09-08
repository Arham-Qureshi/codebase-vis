export const grammar = null;

export function extractDependencies() {
  return [];
}

export function extractEntities(astRoot) {
  try {
    const text = astRoot?.text ?? astRoot ?? '';
    const src = typeof text === 'string' ? text : String(text);
    if (!src.trim()) return { classes: [], functions: [], methods: [], docstrings: [] };
    let data;
    try {
      data = JSON.parse(src);
    } catch {
      const stripped = src.replace(/"(?:\\.|[^"\\])*"|\/\*.*?\*\/|\/\/[^\n]*/gs, m => m.startsWith('"') ? m : '');
      const noTrailing = stripped.replace(/,(\s*[}\]])/g, '$1');
      data = JSON.parse(noTrailing);
    }
    const keys = new Set(Object.keys(data || {}));
    return { classes: [...keys].slice(0, 50), functions: [], methods: [], docstrings: [] };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
