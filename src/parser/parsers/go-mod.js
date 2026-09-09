const MODULE_RE = /^module\s+(.+)$/;
const GO_RE = /^go\s+(\S+)/;
const REQUIRE_BLOCK_RE = /^require\s*\($/;
const REQUIRE_INLINE_RE = /^require\s+(\S+)\s+(\S+)/;
const REQUIRE_LINE_RE = /^\s+(\S+)\s+(\S+)\s*(\/\/ indirect)?$/;
const BLOCK_END_RE = /^\)$/;

export function parseGoMod(content) {
  const lines = content.split('\n');
  const metadata = {};
  const deps = {};
  let inRequireBlock = false;

  for (const raw of lines) {
    const line = raw.trim();

    const moduleMatch = line.match(MODULE_RE);
    if (moduleMatch) {
      metadata.name = moduleMatch[1].trim();
      continue;
    }

    const goMatch = line.match(GO_RE);
    if (goMatch) {
      metadata.goVersion = goMatch[1];
      continue;
    }

    const inlineMatch = line.match(REQUIRE_INLINE_RE);
    if (inlineMatch) {
      deps[inlineMatch[1]] = inlineMatch[2];
      continue;
    }

    if (line.match(REQUIRE_BLOCK_RE)) {
      inRequireBlock = true;
      continue;
    }

    if (inRequireBlock && line.match(BLOCK_END_RE)) {
      inRequireBlock = false;
      continue;
    }

    if (inRequireBlock) {
      const reqMatch = line.match(REQUIRE_LINE_RE);
      if (reqMatch) {
        deps[reqMatch[1]] = reqMatch[2];
      }
    }
  }

  return {
    metadata,
    dependencies: Object.keys(deps).length > 0 ? { dependencies: deps } : {},
  };
}
