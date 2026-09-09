const DEP_CATEGORIES = ['require', 'require-dev'];

export function parseComposerJson(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return { metadata: {}, dependencies: {} };
  }

  const metadata = {};
  if (data.name) metadata.name = data.name;
  if (data.description) metadata.description = data.description;
  if (data.type) metadata.type = data.type;
  if (data.license) {
    metadata.license = Array.isArray(data.license) ? data.license.join(', ') : data.license;
  }
  if (Array.isArray(data.authors)) {
    metadata.author = data.authors.map(a => a.name || a).join(', ');
  }
  if (data.homepage) metadata.homepage = data.homepage;
  if (data.repository) {
    metadata.repository = typeof data.repository === 'string' ? data.repository : data.repository.url || '';
  }

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
