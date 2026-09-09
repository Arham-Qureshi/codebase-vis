import path from 'node:path';
import fs from 'node:fs/promises';
import { parsePackageJson } from './parsers/package-json.js';
import { parseRequirementsTxt } from './parsers/requirements-txt.js';
import { parsePyprojectToml } from './parsers/pyproject-toml.js';
import { parseSetupPy } from './parsers/setup-py.js';
import { parseSetupCfg } from './parsers/setup-cfg.js';
import { parseCargoToml } from './parsers/cargo-toml.js';
import { parseGoMod } from './parsers/go-mod.js';
import { parseComposerJson } from './parsers/composer-json.js';
import { parseGemfile } from './parsers/gemfile.js';

const EMPTY_RESULT = { metadata: {}, dependencies: {} };

const PARSERS = {
  'package.json': parsePackageJson,
  'composer.json': parseComposerJson,
  'requirements.txt': parseRequirementsTxt,
  'pyproject.toml': parsePyprojectToml,
  'setup.py': parseSetupPy,
  'setup.cfg': parseSetupCfg,
  'Cargo.toml': parseCargoToml,
  'go.mod': parseGoMod,
  'Gemfile': parseGemfile,
};

export function getParserForFile(filename) {
  const basename = path.basename(filename);
  return PARSERS[basename] || null;
}

export async function parsePackageFile(filePath) {
  const basename = path.basename(filePath);
  const parser = PARSERS[basename];
  if (!parser) return EMPTY_RESULT;

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parser(content);
  } catch {
    return EMPTY_RESULT;
  }
}

export function parsePackageFileSync(content, filename) {
  const basename = path.basename(filename);
  const parser = PARSERS[basename];
  if (!parser) return EMPTY_RESULT;

  try {
    return parser(content);
  } catch {
    return EMPTY_RESULT;
  }
}

export { PARSERS };
