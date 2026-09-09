const GEM_RE = /^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?(?:,\s*['"]([^'"]*)['"]\s*)*/;
const GEM_SIMPLE_RE = /^\s*gem\s+['"]([^'"]+)['"]/;
const SOURCE_RE = /^\s*source\s+['"]([^'"]+)['"]/;
const GROUP_START_RE = /^\s*group\s+([\w\s:,]+)\s+do\s*$/;
const PLATFORM_START_RE = /^\s*platforms?\s+([\w\s:,]+)\s+do\s*$/;
const GIT_START_RE = /^\s*git\s+['"]([^'"]+)['"](?:\s+do\s*)?$/;
const BLOCK_END_RE = /^\s*end\s*$/;

function parseGemArgs(line) {
  const match = line.match(GEM_RE);
  if (!match) return null;
  const [, name, version1, version2] = match;
  const version = version2 || version1 || '*';
  return { name, version };
}

function parseGroupContext(groupStr) {
  return groupStr.split(',').map(g => g.trim().replace(/:/g, '')).filter(Boolean);
}

export function parseGemfile(content) {
  const lines = content.split('\n');
  const metadata = {};
  const allDeps = {};
  const groupDeps = {};
  let blockStack = [];
  let currentGroups = [];
  let currentPlatform = null;
  let currentGit = null;

  for (const raw of lines) {
    const line = raw.trim();

    const sourceMatch = line.match(SOURCE_RE);
    if (sourceMatch) {
      metadata.source = sourceMatch[1];
      continue;
    }

    if (line.match(BLOCK_END_RE) && blockStack.length > 0) {
      const popped = blockStack.pop();
      if (popped.type === 'group') currentGroups = [];
      else if (popped.type === 'platform') currentPlatform = null;
      else if (popped.type === 'git') currentGit = null;
      continue;
    }

    const groupMatch = line.match(GROUP_START_RE);
    if (groupMatch) {
      currentGroups = parseGroupContext(groupMatch[1]);
      blockStack.push({ type: 'group' });
      continue;
    }

    const platformMatch = line.match(PLATFORM_START_RE);
    if (platformMatch) {
      currentPlatform = platformMatch[1].trim();
      blockStack.push({ type: 'platform' });
      continue;
    }

    const gitMatch = line.match(GIT_START_RE);
    if (gitMatch) {
      currentGit = gitMatch[1];
      blockStack.push({ type: 'git' });
      continue;
    }

    const gem = parseGemArgs(line);
    if (gem) {
      allDeps[gem.name] = gem.version;

      if (currentGroups.length > 0) {
        for (const group of currentGroups) {
          if (!groupDeps[group]) groupDeps[group] = {};
          groupDeps[group][gem.name] = gem.version;
        }
      }
    }
  }

  const dependencies = {};

  const devGroups = ['development', 'test', 'development, test'];
  const devDeps = {};
  const prodDeps = {};

  for (const [name, version] of Object.entries(allDeps)) {
    let isDev = false;
    for (const group of Object.keys(groupDeps)) {
      if (devGroups.some(dg => group.toLowerCase().includes(dg)) && groupDeps[group][name]) {
        isDev = true;
        break;
      }
    }
    if (isDev) {
      devDeps[name] = version;
    } else {
      prodDeps[name] = version;
    }
  }

  if (Object.keys(prodDeps).length > 0) dependencies.dependencies = prodDeps;
  if (Object.keys(devDeps).length > 0) dependencies.devDependencies = devDeps;

  // If no group separation was found, put everything in dependencies
  if (Object.keys(groupDeps).length === 0 && Object.keys(allDeps).length > 0) {
    dependencies.dependencies = allDeps;
  }

  return { metadata, dependencies };
}
