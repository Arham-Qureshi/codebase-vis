import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'graph.html');

let cachedHtml = null;

export async function getHtmlTemplate() {
  if (!cachedHtml) {
    cachedHtml = await readFile(TEMPLATE_PATH, 'utf-8');
  }
  return cachedHtml;
}