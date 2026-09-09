const DEP_LINE_RE = /^([a-zA-Z0-9_.-]+)\s*([=<>!~\[]+)?\s*(.+)?$/;
const INCLUDE_RE = /^-r\s+(.+)$/;
const EDITABLE_RE = /^-e\s+(.+)$/;
const CONSTRAINT_RE = /^--constraint\s+(.+)$/;

export function parseRequirementsTxt(content) {
  const lines = content.split('\n');
  const deps = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;

    const match = line.match(DEP_LINE_RE);
    if (match) {
      const [, name, operator, version] = match;
      if (operator && version) {
        deps[name] = `${operator}${version}`;
      } else {
        deps[name] = '*';
      }
    }
  }

  return {
    metadata: {},
    dependencies: Object.keys(deps).length > 0 ? { dependencies: deps } : {},
  };
}
