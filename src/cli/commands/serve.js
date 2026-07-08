import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { getOutDirPath } from '../../utils/file-system.js';

// lookup for the static file server
const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

// serve => spins up a local HTTP server to view the generated graph
export async function serveCommand(options = {}) {
  const port = parseInt(options.port, 10) || 3000;
  const outDir = getOutDirPath();

  p.intro(pc.bgMagenta(pc.white(' agent-context serve ')));

  try {
    await fs.access(outDir);
  } catch {
    p.log.error(pc.red('codebase-out/ not found. Run ') + pc.cyan('agent-context generate') + pc.red(' first.'));
    p.outro(pc.dim('Nothing to serve.'));
    return;
  }

  const server = http.createServer(async (req, res) => {
    const urlPath = req.url === '/' ? '/graph.html' : req.url;
    const filePath = path.join(outDir, urlPath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      p.log.error(pc.red(`Port ${port} is already in use. Try a different port with `) + pc.cyan(`--port <number>`));
      p.outro(pc.dim('Server could not start.'));
    } else {
      p.log.error(pc.red(`Server error: ${err.message}`));
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    p.log.success(pc.green(`Server running at ${pc.bold(url)}`));
    p.log.info(pc.dim('Press Ctrl+C to stop the server.'));

    // auto-open browser 
    const platform = process.platform;
    const openCmd = platform === 'darwin' ? 'open'
      : platform === 'win32' ? 'start'
        : 'xdg-open';

    exec(`${openCmd} ${url}`, () => {
    });
  });
}