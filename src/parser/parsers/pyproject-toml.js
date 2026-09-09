import { parse as parseToml } from 'smol-toml';

const VERSION_SPEC_RE = /^([a-zA-Z0-9_.-]+)\s*(.*)$/;

function extractDepsFromArray(arr) {
  if (!Array.isArray(arr)) return {};
  const deps = {};
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const match = item.match(VERSION_SPEC_RE);
    if (match) {
      const [, name, versionSpec] = match;
      deps[name] = versionSpec || '*';
    }
  }
  return deps;
}

function extractDepsFromTable(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const deps = {};
  for (const [name, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      deps[name] = value;
    } else if (value && typeof value === 'object' && value.version) {
      deps[name] = value.version;
    }
  }
  return deps;
}

export function parsePyprojectToml(content) {
  let data;
  try {
    data = parseToml(content);
  } catch {
    return { metadata: {}, dependencies: {} };
  }

  const metadata = {};
  const project = data.project || {};
  const poetry = data.tool?.poetry || {};

  const src = Object.keys(project).length > 0 ? project : poetry;
  if (src.name) metadata.name = src.name;
  if (src.version) metadata.version = String(src.version);
  if (src.description) metadata.description = src.description;

  if (Array.isArray(src.authors)) {
    metadata.author = src.authors.map(a => {
      if (typeof a === 'string') return a;
      return a.name || a.email || '';
    }).filter(Boolean).join(', ');
  }

  if (src.license) {
    metadata.license = typeof src.license === 'string' ? src.license : src.license.text || '';
  }

  if (Array.isArray(src.keywords)) metadata.keywords = src.keywords;
  if (src.requires-python) metadata.requiresPython = src.requires-python;
  if (src.homepage) metadata.homepage = src.homepage;
  if (src.repository) metadata.repository = src.repository;
  if (src.readme) metadata.readme = src.readme;

  const dependencies = {};

  // Standard PEP 621 format
  if (Array.isArray(project.dependencies)) {
    const deps = extractDepsFromArray(project.dependencies);
    if (Object.keys(deps).length > 0) dependencies.dependencies = deps;
  }

  if (project.optional_dependencies && typeof project.optional_dependencies === 'object') {
    for (const [group, items] of Object.entries(project.optional_dependencies)) {
      const deps = Array.isArray(items) ? extractDepsFromArray(items) : extractDepsFromTable(items);
      if (Object.keys(deps).length > 0) {
        dependencies[`${group}_dependencies`] = deps;
      }
    }
  }

  // Poetry format
  if (poetry.dependencies && typeof poetry.dependencies === 'object') {
    const deps = {};
    for (const [name, value] of Object.entries(poetry.dependencies)) {
      if (name === 'python') continue;
      if (typeof value === 'string') {
        deps[name] = value;
      } else if (value && typeof value === 'object' && value.version) {
        deps[name] = value.version;
      }
    }
    if (Object.keys(deps).length > 0 && !dependencies.dependencies) {
      dependencies.dependencies = deps;
    }
  }

  if (poetry['dev-dependencies'] && typeof poetry['dev-dependencies'] === 'object') {
    const deps = {};
    for (const [name, value] of Object.entries(poetry['dev-dependencies'])) {
      if (typeof value === 'string') {
        deps[name] = value;
      } else if (value && typeof value === 'object' && value.version) {
        deps[name] = value.version;
      }
    }
    if (Object.keys(deps).length > 0 && !dependencies.devDependencies) {
      dependencies.devDependencies = deps;
    }
  }

  return { metadata, dependencies };
}
