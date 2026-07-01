import fs from 'node:fs/promises';
import path from 'node:path';

// reads package.json and categorises the project
export async function detectTechStack(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');

  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);

    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    const allDeps = [...deps, ...devDeps];

    if (allDeps.includes('next')) return { type: 'nextjs' };
    if (allDeps.includes('react')) return { type: 'react' };

    return { type: 'node' };
  } catch {
    // package.json missing 
    return { type: 'node', dependencies: [] };
  }
}