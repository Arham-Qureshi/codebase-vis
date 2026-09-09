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
    const markdownHierarchy = [];
    const markdownLinks = [];
    let inFence = false;
    let currentHeading = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
      if (m) {
        const depth = m[1].length;
        const title = m[2].trim().replace(/\s+#+\s*$/, '').trim();
        if (title) {
          headings.push(title);
          markdownHierarchy.push({ title, depth });
          currentHeading = title;
        }
      }
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = linkRegex.exec(line)) !== null) {
        const target = match[2];
        const type = target.startsWith('http') ? 'external' : 'relative';
        markdownLinks.push({ text: match[1], target, type });
      }
      const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      while ((match = wikiRegex.exec(line)) !== null) {
        markdownLinks.push({ text: match[1], target: match[1], type: 'wiki' });
      }
    }
    const uniq = [...new Set(headings)];
    return { classes: [], functions: uniq, methods: [], docstrings: [], markdownHierarchy, markdownLinks };
  } catch {
    return { classes: [], functions: [], methods: [], docstrings: [], markdownHierarchy: [], markdownLinks: [] };
  }
}
