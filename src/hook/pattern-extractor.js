const SEARCH_RE = /\b(grep|rg|ripgrep|find|ag|ack)\b/;
const PATTERN_RE = /(?:grep|rg|ripgrep|find|ag|ack)\s+(?:-[a-zA-Z]+\s+)*['"]?([a-zA-Z0-9_]{3,})['"]?/;
const ESCAPE_RE = /(--graph-tried|# --graph-tried|# graph-checked)/;

export function isSearchCommand(command) {
  if (!command || typeof command !== 'string') return false;
  return SEARCH_RE.test(command);
}

export function hasEscapeHatch(command) {
  if (!command || typeof command !== 'string') return false;
  return ESCAPE_RE.test(command);
}

export function extractPattern(command) {
  if (!command || typeof command !== 'string') return null;
  const m = command.match(PATTERN_RE);
  return m ? m[1] : null;
}

export function shouldIntercept(command) {
  if (!isSearchCommand(command)) return { intercept: false, pattern: null, reason: 'not_search' };
  if (hasEscapeHatch(command)) return { intercept: false, pattern: null, reason: 'escape_hatch' };
  const pattern = extractPattern(command);
  if (!pattern) return { intercept: false, pattern: null, reason: 'no_pattern' };
  return { intercept: true, pattern, reason: 'search' };
}
