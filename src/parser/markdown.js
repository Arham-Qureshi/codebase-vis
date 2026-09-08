export const grammar = null;

export function extractDependencies() {
  return [];
}

export function extractEntities(astRoot) {
  try {
    const text = astRoot?.text ?? astRoot ?? '';
    const src = typeof text === 'string' ? text : String(text);
    const lines = src.split('\n');
    const headings = [];
    let inFence = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
      if (m) {
        const title = m[2].trim().replace(/\s+#+\s*$/, '').trim();
        if (title) headings.push(title);
      }
    }
    const uniq = [...new Set(headings)];
    return { classes: [], functions: uniq, methods: [], docstrings: [] };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [] };
  }
}
