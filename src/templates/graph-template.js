import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_DIR = path.join(__dirname, 'graph');

let cachedHtml = null;

export async function getHtmlTemplate() {
  if (!cachedHtml) {
    const [frame, css, js] = await Promise.all([
      readFile(path.join(GRAPH_DIR, 'frame.html'), 'utf-8'),
      readFile(path.join(GRAPH_DIR, 'style.css'), 'utf-8'),
      readFile(path.join(GRAPH_DIR, 'script.js'), 'utf-8'),
    ]);
    cachedHtml = frame
      .replace('<!-- CSS -->', `<style>\n${css}\n  </style>`)
      .replace('<!-- SCRIPT -->', `<script>\n${js}\n  </script>`);
  }
  return cachedHtml;
}