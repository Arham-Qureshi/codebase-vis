import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';

const parser = new Parser();
parser.setLanguage(Python);

const SETUP_CALL_QUERY = `
(call
  function: (identifier) @func_name
  arguments: (argument_list) @args)`;

const KEYWORD_ARG_QUERY = `
(argument
  name: (keyword_identifier) @key
  value: (_) @value)`;

const STRING_QUERY = `(string) @string`;
const LIST_QUERY = `(list) @list`;

export function parseSetupPy(content) {
  let tree;
  try {
    tree = parser.parse(content);
  } catch {
    return { metadata: {}, dependencies: {} };
  }

  const setupArgs = findSetupCall(tree);
  if (!setupArgs) return { metadata: {}, dependencies: {} };

  const metadata = {};
  const dependencies = {};
  const installRequires = [];
  const extrasRequire = {};

  for (const child of setupArgs.namedChildren) {
    if (child.type !== 'keyword_argument') continue;

    const keyNode = child.namedChildren.find(n => n.type === 'identifier');
    const valueNode = child.namedChildren.find(n => n.type !== 'identifier');
    if (!keyNode || !valueNode) continue;

    const key = keyNode.text;

    if (key === 'name' || key === 'version' || key === 'description' || key === 'author' || key === 'license') {
      metadata[key] = extractString(valueNode);
    } else if (key === 'install_requires') {
      extractListStrings(valueNode, installRequires);
    } else if (key === 'extras_require') {
      extractExtrasRequire(valueNode, extrasRequire);
    }
  }

  if (installRequires.length > 0) {
    dependencies.dependencies = arrayToDeps(installRequires);
  }

  for (const [group, items] of Object.entries(extrasRequire)) {
    if (items.length > 0) {
      dependencies[`${group}_dependencies`] = arrayToDeps(items);
    }
  }

  return { metadata, dependencies };
}

function findSetupCall(tree) {
  const query = new Parser.Query(tree.language, SETUP_CALL_QUERY);
  const captures = query.captures(tree.rootNode);

  for (const capture of captures) {
    if (capture.name === 'func_name' && capture.node.text === 'setup') {
      const argsCapture = captures.find(c => c.name === 'args' && c.node.parent === capture.node.parent);
      if (argsCapture) return argsCapture.node;
    }
  }
  return null;
}

function extractString(node) {
  if (node.type === 'string') {
    return node.text.replace(/^['"]|['"]$/g, '');
  }
  if (node.type === 'concatenated_string') {
    return node.namedChildren.map(n => extractString(n)).join('');
  }
  return node.text.replace(/^['"]|['"]$/g, '');
}

function extractListStrings(node, result) {
  if (node.type !== 'list') return;
  for (const child of node.namedChildren) {
    if (child.type === 'string') {
      result.push(extractString(child));
    }
  }
}

function extractExtrasRequire(node, result) {
  if (node.type !== 'dictionary') return;
  for (const pair of node.namedChildren) {
    if (pair.type !== 'pair') continue;
    const keyNode = pair.namedChildren[0];
    const valueNode = pair.namedChildren[1];
    if (!keyNode || !valueNode) continue;

    const group = extractString(keyNode);
    const items = [];
    extractListStrings(valueNode, items);
    result[group] = items;
  }
}

function arrayToDeps(arr) {
  const deps = {};
  for (const item of arr) {
    const cleaned = item.trim();
    const match = cleaned.match(/^([a-zA-Z0-9_.-]+)\s*(.*)$/);
    if (match) {
      const [, name, version] = match;
      deps[name] = version || '*';
    }
  }
  return deps;
}
