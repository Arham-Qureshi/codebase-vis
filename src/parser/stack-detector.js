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
export async function detectTechStack(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');
  const pyprojectPath = path.join(rootDir, 'pyproject.toml');
  const requirementsPath = path.join(rootDir, 'requirements.txt');
  const setupPath = path.join(rootDir, 'setup.py');
  const cmakePath = path.join(rootDir, 'CMakeLists.txt');
  const makefilePath = path.join(rootDir, 'Makefile');

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
    // extract package name before any version specifier
    const pkgName = trimmed.split(/[=<>!~[\s]/)[0];
    return pkgName === depLower;
  });
}

export async function detectTechStack(rootDir) {
  // clear cache for each detection run
  fileCache.clear();

  for (const entry of STACK_MARKERS) {
    const content = await readMarkerFile(rootDir, entry.marker);

    if (content === null) continue;

    if (!entry.dep) {
      return { type: entry.type };
    }

    // dep check: dispatch based on marker file type
    const filename = entry.marker;
    let found = false;

    if (filename === 'package.json') {
      found = hasDependencyInPackageJson(content, entry.dep);
    } else if (filename === 'requirements.txt') {
      found = hasDependencyInRequirements(content, entry.dep);
    }

    if (found) {
      return { type: entry.type };
    }
  }

  // nothing matched
  return { type: 'unknown' };
    if (allDeps.includes('next')) return { type: 'nextjs' };
    if (allDeps.includes('@angular/core')) return { type: 'angular' };
    if (allDeps.includes('react')) return { type: 'react' };

    return { type: 'node' };
  } catch {
  }

  try {
    await fs.access(pyprojectPath);
    return { type: 'python' };
  } catch {
  }

  try {
    await fs.access(requirementsPath);
    return { type: 'python' };
  } catch {
  }

  try {
    await fs.access(setupPath);
    return { type: 'python' };
  } catch {
  }

  try {
    await fs.access(cmakePath);
    return { type: 'cpp' };
  } catch {
  }

  try {
    await fs.access(makefilePath);
    return { type: 'cpp' };
  } catch {
  }

  try {
    await fs.access(path.join(rootDir, 'Cargo.toml'));
    return { type: 'rust' };
  } catch {
  }

  try {
    await fs.access(path.join(rootDir, 'go.mod'));
    return { type: 'go' };
  } catch {
  }

  try {
    await fs.access(path.join(rootDir, 'composer.json'));
    return { type: 'php' };
  } catch {
  }

  try {
    await fs.access(path.join(rootDir, 'Gemfile'));
    return { type: 'ruby' };
  } catch {
  }

  try {
    await fs.access(path.join(rootDir, 'build.gradle'));
    return { type: 'java' };
  } catch {
  }

  try {
    await fs.access(path.join(rootDir, 'pom.xml'));
    return { type: 'java' };
  } catch {
  }

  return { type: 'node' };
}