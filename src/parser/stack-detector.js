import fs from 'node:fs/promises';
import path from 'node:path';

export async function detectTechStack(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');
  const pyprojectPath = path.join(rootDir, 'pyproject.toml');
  const requirementsPath = path.join(rootDir, 'requirements.txt');
  const setupPath = path.join(rootDir, 'setup.py');
  const cmakePath = path.join(rootDir, 'CMakeLists.txt');
  const makefilePath = path.join(rootDir, 'Makefile');

  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);

    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    const allDeps = [...deps, ...devDeps];

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