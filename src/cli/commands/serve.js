import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { getOutDirPath } from '../../utils/file-system.js';
import { logger } from '../../utils/logger.js';

const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

export async function serveCommand(options = {}) {
  const port = Math.min(65535, Math.max(1, parseInt(options.port, 10) || 3000));
  const outDir = getOutDirPath();

  logger.info('Serve', `Starting server — port=${port}, outDir=${path.relative(process.cwd(), outDir)}`);

  p.intro(pc.bgMagenta(pc.white(' codebase-vis serve ')));

  try {
    await fs.access(outDir);
    logger.info('Serve', 'Output directory verified');
  } catch {
    p.log.error(pc.red('codebase-out/ not found. Run ') + pc.cyan('codebase-vis generate') + pc.red(' first.'));
    p.outro(pc.dim('Nothing to serve.'));
    logger.warn('Serve', 'Server aborted — codebase-out/ not found');
    return;
  }

  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();
    const urlPath = req.url === '/' ? '/graph.html' : req.url;
    const clientIp = req.socket.remoteAddress;

    logger.debug('HTTP', `Request — ${req.method} ${urlPath} from ${clientIp}`);

    const resolvedPath = path.resolve(outDir, '.' + urlPath);
    if (path.relative(outDir, resolvedPath).startsWith('..')) {
      logger.warn('HTTP', `Path traversal blocked — urlPath=${urlPath}, resolved=${path.relative(process.cwd(), resolvedPath)}, clientIp=${clientIp}`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      logger.info('HTTP', `Response — 403 ${urlPath} from ${clientIp} (${Date.now() - startTime}ms)`);
      return;
    }

    const ext = path.extname(resolvedPath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    try {
      const data = await fs.readFile(resolvedPath);
      const sizeKb = Math.round(data.length / 1024);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
      logger.info('HTTP', `Response — 200 ${urlPath} (${contentType}, ${sizeKb}KB) from ${clientIp} (${Date.now() - startTime}ms)`);
    } catch {
      logger.debug('HTTP', `File not found — ${path.relative(process.cwd(), resolvedPath)}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      logger.info('HTTP', `Response — 404 ${urlPath} from ${clientIp} (${Date.now() - startTime}ms)`);
    }
  });

  server.maxConnections = 128;
  server.timeout = 30000;

  server.on('error', (err) => {
    logger.error('Serve', `Server error — code=${err.code}`);
    if (err.code === 'EADDRINUSE') {
      p.log.error(pc.red(`Port ${port} is already in use. Try a different port with `) + pc.cyan(`--port <number>`));
      p.outro(pc.dim('Server could not start.'));
    } else {
      p.log.error(pc.red('Server error occurred. Check port availability.'));
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    logger.info('Serve', `Server listening on ${url} — maxConnections=128, timeout=30s`);
    p.log.success(pc.green(`Server running at ${pc.bold(url)}`));
    p.log.info(pc.dim('Press Ctrl+C to stop the server.'));

    const platform = process.platform;
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', url], {
        stdio: 'ignore',
        detached: true,
        shell: false,
      }).unref();
    } else {
      const openCmd = platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(openCmd, [url], {
        stdio: 'ignore',
        detached: true,
        shell: false,
      }).unref();
    }
    logger.debug('Serve', `Browser auto-open attempted — platform=${platform}, url=${url}`);
  });
}
