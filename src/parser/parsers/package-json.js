const DEP_CATEGORIES = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

export function parsePackageJson(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    const stripped = content.replace(/"(?:\\.|[^"\\])*"|\/\*.*?\*\/|\/\/[^\n]*/gs, m => m.startsWith('"') ? m : '');
    const noTrailing = stripped.replace(/,(\s*[}\]])/g, '$1');
    data = JSON.parse(noTrailing);
  }

  const metadata = {};
  if (data.name) metadata.name = data.name;
  if (data.version) metadata.version = data.version;
  if (data.description) metadata.description = data.description;
  if (data.repository) {
    metadata.repository = typeof data.repository === 'string'
      ? data.repository
      : data.repository.url || '';
  }
  if (Array.isArray(data.keywords)) metadata.keywords = data.keywords;
  if (data.author) metadata.author = typeof data.author === 'string' ? data.author : data.author.name || '';
  if (data.license) metadata.license = typeof data.license === 'string' ? data.license : '';
  if (data.homepage) metadata.homepage = data.homepage;
  if (data.engines && typeof data.engines === 'object') metadata.engines = data.engines;
  if (data.scripts && typeof data.scripts === 'object') metadata.scripts = data.scripts;

  const dependencies = {};
  for (const category of DEP_CATEGORIES) {
    if (data[category] && typeof data[category] === 'object') {
      const deps = {};
      for (const [name, version] of Object.entries(data[category])) {
        if (typeof version === 'string') {
          deps[name] = version;
        }
      }
      if (Object.keys(deps).length > 0) {
        dependencies[category] = deps;
      }
    }
  }

  return { metadata, dependencies };
}
