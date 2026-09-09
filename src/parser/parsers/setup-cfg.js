const SECTION_RE = /^\[([^\]]+)\]$/;
const KEY_VALUE_RE = /^(\w[\w-]*)\s*=\s*(.*)$/;

export function parseSetupCfg(content) {
  const lines = content.split('\n');
  const sections = {};
  let currentSection = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections[currentSection]) sections[currentSection] = {};
      continue;
    }

    if (currentSection) {
      const kvMatch = line.match(KEY_VALUE_RE);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        if (sections[currentSection][key]) {
          sections[currentSection][key] += '\n' + value;
        } else {
          sections[currentSection][key] = value;
        }
      } else if (sections[currentSection]._continuation !== undefined) {
        sections[currentSection]._continuation += '\n' + line;
      }
    }
  }

  const metadata = {};
  const meta = sections.metadata || {};
  if (meta.name) metadata.name = meta.name;
  if (meta.version) metadata.version = meta.version;
  if (meta.description) metadata.description = meta.description;
  if (meta.author) metadata.author = meta.author;
  if (meta.license) metadata.license = meta.license;

  const dependencies = {};
  const options = sections.options || {};

  if (options.install_requires) {
    const deps = parseMultilineValue(options.install_requires);
    if (Object.keys(deps).length > 0) dependencies.dependencies = deps;
  }

  if (options.extras_require) {
    const extras = parseExtrasRequire(options.extras_require);
    for (const [group, deps] of Object.entries(extras)) {
      if (group === 'dev' || group === 'testing') {
        dependencies.devDependencies = deps;
      } else {
        dependencies[`${group}_dependencies`] = deps;
      }
    }
  }

  return { metadata, dependencies };
}

function parseMultilineValue(value) {
  const deps = {};
  const lines = value.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*([=<>!~\[]+)?\s*(.+)?$/);
    if (match) {
      const [, name, operator, version] = match;
      deps[name] = operator && version ? `${operator}${version}` : '*';
    }
  }
  return deps;
}

function parseExtrasRequire(value) {
  const groups = {};
  const lines = value.split('\n');
  let currentGroup = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const groupMatch = trimmed.match(/^(\w[\w-]*):/);
    if (groupMatch) {
      currentGroup = groupMatch[1];
      groups[currentGroup] = {};
      const afterColon = trimmed.slice(groupMatch[0].length).trim();
      if (afterColon) {
        const depMatch = afterColon.match(/^([a-zA-Z0-9_.-]+)\s*([=<>!~\[]+)?\s*(.+)?$/);
        if (depMatch) {
          const [, name, operator, version] = depMatch;
          groups[currentGroup][name] = operator && version ? `${operator}${version}` : '*';
        }
      }
      continue;
    }

    if (currentGroup) {
      const depMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*([=<>!~\[]+)?\s*(.+)?$/);
      if (depMatch) {
        const [, name, operator, version] = depMatch;
        groups[currentGroup][name] = operator && version ? `${operator}${version}` : '*';
      }
    }
  }

  return groups;
}
