import fs from 'node:fs';
import path from 'node:path';

const _aliasCache = new Map();

function stripJsonc(text) {
  const pattern = /"(?:\\.|[^"\\])*"|\/\*.*?\*\/|\/\/[^\n]*/gs;
  const stripped = text.replace(pattern, (tok) => (tok.startsWith('"') ? tok : ''));
  return stripped.replace(/,(\s*[}\]])/g, '$1');
}

function readTsconfigAliases(tsconfigPath, baseDir, seen) {
  const key = String(tsconfigPath);
  if (seen.has(key)) return {};
  seen.add(key);
  let raw;
  try { raw = fs.readFileSync(tsconfigPath, 'utf8'); } catch { return {}; }
  let data;
  try { data = JSON.parse(raw); } catch {
    try { data = JSON.parse(stripJsonc(raw)); } catch { return {}; }
  }
  let aliases = {};
  const ext = data.extends;
  if (ext && typeof ext === 'string' && !ext.startsWith('@')) {
    let extended = path.resolve(baseDir, ext);
    if (!path.extname(extended)) extended += '.json';
    if (fs.existsSync(extended)) aliases = { ...readTsconfigAliases(extended, path.dirname(extended), seen), ...aliases };
  }
  const paths = data?.compilerOptions?.paths;
  if (paths && typeof paths === 'object') {
    for (const [alias, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const aliasPrefix = alias.replace(/\*$/, '');
      const targetBase = String(targets[0]).replace(/\*$/, '').replace(/\/$/, '');
      aliases[aliasPrefix] = path.resolve(baseDir, targetBase);
    }
  }
  return aliases;
}

export function loadTsconfigAliases(startDir) {
  let current = path.resolve(String(startDir || process.cwd()));
  const dirs = [current];
  let parent = path.dirname(current);
  while (parent !== current) {
    dirs.push(parent);
    current = parent;
    parent = path.dirname(current);
  }
  for (const dir of dirs) {
    const tsconfig = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(tsconfig)) {
      if (!_aliasCache.has(tsconfig)) _aliasCache.set(tsconfig, readTsconfigAliases(tsconfig, dir, new Set()));
      return _aliasCache.get(tsconfig);
    }
  }
  return {};
}

export function clearResolverCache() { _aliasCache.clear(); }

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.svelte'];
const JS_INDEX = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

function existsFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function existsDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function stripQuotes(s) { return s.replace(/^['"`]|['"`]$/g, ''); }

function tryResolveFile(basePath) {
  if (existsFile(basePath)) return basePath;
  if (basePath.endsWith('.js')) { const ts = basePath.slice(0, -3) + '.ts'; if (existsFile(ts)) return ts; }
  if (basePath.endsWith('.jsx')) { const tsx = basePath.slice(0, -4) + '.tsx'; if (existsFile(tsx)) return tsx; }
  for (const ext of JS_EXTS) { const c = basePath + ext; if (existsFile(c)) return c; }
  if (existsDir(basePath)) {
    for (const idx of JS_INDEX) { const c = path.join(basePath, idx); if (existsFile(c)) return c; }
  }
  return null;
}

export function resolveJsImport(rawSpec, fromDir) {
  const spec = stripQuotes(String(rawSpec).trim());
  if (!spec) return spec;
  const aliases = loadTsconfigAliases(fromDir);
  for (const [prefix, base] of Object.entries(aliases)) {
    const isMatch = prefix.endsWith('/') ? spec.startsWith(prefix) : (spec === prefix || spec.startsWith(prefix + '/'));
    if (!isMatch) continue;
    const suffix = spec.slice(prefix.length).replace(/^\//, '');
    const candidate = path.join(base, suffix);
    const resolved = tryResolveFile(candidate);
    if (resolved) {
      const rel = path.relative(path.resolve(fromDir), resolved);
      return rel.startsWith('.') ? rel : `./${rel}`;
    }
    return spec;
  }
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const basePath = path.resolve(fromDir, spec);
    const resolved = tryResolveFile(basePath);
    if (resolved) {
      const rel = path.relative(path.resolve(fromDir), resolved);
      return rel.startsWith('.') ? rel : `./${rel}`;
    }
  }
  return spec;
}
