import fs from 'node:fs/promises';
import path from 'node:path';
import { STACK_MARKERS } from './languages.js';

const fileCache = new Map();

async function readMarkerFile(rootDir, filename) {
  const key = path.join(rootDir, filename);
  if (fileCache.has(key)) return fileCache.get(key);

  try {
    const content = await fs.readFile(key, 'utf8');
    fileCache.set(key, content);
    return content;
  } catch {
    fileCache.set(key, null);
    return null;
  }
}

function hasDependencyInPackageJson(raw, dep) {
  try {
    const pkg = JSON.parse(raw);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    return dep in allDeps;
  } catch {
    return false;
  }
}

function hasDependencyInRequirements(raw, dep) {
  const lines = raw.split('\n');
  const depLower = dep.toLowerCase();
  return lines.some((line) => {
    const trimmed = line.trim().toLowerCase();
    if (!trimmed || trimmed.startsWith('#')) return false;
    const pkgName = trimmed.split(/[=<>!~[\s]/)[0];
    return pkgName === depLower;
  });
}

export async function detectTechStack(rootDir) {
  fileCache.clear();

  for (const entry of STACK_MARKERS) {
    const content = await readMarkerFile(rootDir, entry.marker);
    if (content === null) continue;

    if (entry.dep) {
      let found = false;
      if (entry.marker === 'package.json') {
        found = hasDependencyInPackageJson(content, entry.dep);
      } else if (entry.marker === 'requirements.txt') {
        found = hasDependencyInRequirements(content, entry.dep);
      }
      if (found) return { type: entry.type };
    } else {
      if (entry.marker === 'package.json') {
        try { JSON.parse(content); } catch { continue; }
      }
      return { type: entry.type };
    }
  }

  return { type: 'node' };
}