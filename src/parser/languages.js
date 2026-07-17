import path from 'node:path';

export const LANGUAGES = {
  JavaScript: {
    extensions: ['.js', '.jsx'],
    parser: 'javascript',
    color: '#f1e05a',
    ignores: ['node_modules', 'dist', 'build', '.next', 'coverage'],
  },
  TypeScript: {
    extensions: ['.ts', '.tsx'],
    parser: 'typescript',
    color: '#3178c6',
    ignores: ['node_modules', 'dist', 'build', '.next', 'coverage'],
  },
  Python: {
    extensions: ['.py'],
    parser: 'python',
    color: '#3572A5',
    ignores: ['venv', '__pycache__', '.pytest_cache', '*.pyc', 'dist', 'build', '.venv'],
  },
  'C++': {
    extensions: ['.cpp', '.h', '.hpp'],
    parser: 'cpp',
    color: '#f34b7d',
    ignores: ['build', 'cmake-build-*', '.vscode'],
  },
  HTML: {
    extensions: ['.html'],
    parser: 'html',
    color: '#e34c26',
    ignores: [],
  },
  CSS: {
    extensions: ['.css'],
    parser: 'css',
    color: '#563d7c',
    ignores: [],
  },
  Rust: {
    extensions: ['.rs'],
    parser: 'rust',
    color: '#dea584',
    ignores: ['target'],
  },
  Go: {
    extensions: ['.go'],
    parser: 'go',
    color: '#00ADD8',
    ignores: [],
  },
  Java: {
    extensions: ['.java'],
    parser: 'java',
    color: '#b07219',
    ignores: ['build', '.gradle', 'target'],
  },
};

export const EXT_TO_LANGUAGE = {};
export const EXT_TO_PARSER = {};

export const KNOWN_EXTENSIONS = new Set();

for (const [lang, def] of Object.entries(LANGUAGES)) {
  for (const ext of def.extensions) {
    EXT_TO_LANGUAGE[ext] = lang;
    EXT_TO_PARSER[ext] = def.parser;
    KNOWN_EXTENSIONS.add(ext);
  }
}
export const STACK_MARKERS = [
  { marker: 'package.json', dep: 'next', type: 'nextjs' },
  { marker: 'package.json', dep: '@angular/core', type: 'angular' },
  { marker: 'package.json', dep: 'react', type: 'react' },
  { marker: 'package.json', dep: 'vue', type: 'vue' },
  { marker: 'package.json', dep: 'svelte', type: 'svelte' },
  { marker: 'package.json', dep: 'express', type: 'express' },
  { marker: 'package.json', dep: 'fastify', type: 'fastify' },
  { marker: 'package.json', dep: 'hono', type: 'hono' },
  { marker: 'package.json', type: 'node' },

  { marker: 'requirements.txt', dep: 'django', type: 'django' },
  { marker: 'requirements.txt', dep: 'flask', type: 'flask' },
  { marker: 'requirements.txt', dep: 'fastapi', type: 'fastapi' },
  { marker: 'pyproject.toml', type: 'python' },
  { marker: 'setup.py', type: 'python' },
  { marker: 'requirements.txt', type: 'python' },

  { marker: 'CMakeLists.txt', type: 'cpp' },
  { marker: 'Makefile', type: 'cpp' },
  { marker: 'Cargo.toml', type: 'rust' },
  { marker: 'go.mod', type: 'go' },
  { marker: 'composer.json', type: 'php' },
  { marker: 'Gemfile', type: 'ruby' },
  { marker: 'pom.xml', type: 'java' },
  { marker: 'build.gradle', type: 'java' },
  { marker: 'build.gradle.kts', type: 'java' },
];

export function detectLanguages(files) {
  const counts = {};

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const lang = EXT_TO_LANGUAGE[ext];
    if (lang) {
      counts[lang] = (counts[lang] || 0) + 1;
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  return Object.entries(counts)
    .map(([language, count]) => ({
      language,
      count,
      pct: parseFloat(((count / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);
}