import { parse as parseToml } from 'smol-toml';

const DEP_CATEGORIES = [
  'dependencies',
  'dev-dependencies',
  'build-dependencies',
];

function normalizeCategoryName(tomlKey) {
  return tomlKey.replace(/-/g, '_');
}

function extractDeps(depsObj) {
  if (!depsObj || typeof depsObj !== 'object') return {};
  const deps = {};
  for (const [name, value] of Object.entries(depsObj)) {
    if (typeof value === 'string') {
      deps[name] = value;
    } else if (value && typeof value === 'object' && value.version) {
      deps[name] = value.version;
    }
  }
  return deps;
}

export function parseCargoToml(content) {
  let data;
  try {
    data = parseToml(content);
  } catch {
    return { metadata: {}, dependencies: {} };
  }

  const metadata = {};
  const pkg = data.package;
  if (pkg) {
    if (pkg.name) metadata.name = pkg.name;
    if (pkg.version) metadata.version = String(pkg.version);
    if (pkg.description) metadata.description = pkg.description;
    if (Array.isArray(pkg.authors)) metadata.author = pkg.authors.join(', ');
    if (pkg.license) metadata.license = pkg.license;
    if (pkg.edition) metadata.edition = pkg.edition;
    if (pkg.repository) metadata.repository = pkg.repository;
    if (pkg.homepage) metadata.homepage = pkg.homepage;
    if (pkg.keywords && Array.isArray(pkg.keywords)) metadata.keywords = pkg.keywords;
  }

  const dependencies = {};
  for (const category of DEP_CATEGORIES) {
    const normalizedName = normalizeCategoryName(category);
    const deps = extractDeps(data[category] || data[normalizedName]);
    if (Object.keys(deps).length > 0) {
      dependencies[normalizedName] = deps;
    }
  }

  return { metadata, dependencies };
}
