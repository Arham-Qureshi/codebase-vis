import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };
const LEVEL_NAMES = ['DEBUG', 'INFO ', 'WARN ', 'ERROR', 'FATAL'];
const currentLevel = LEVELS[process.env.CODEBASE_VIS_LOG_LEVEL] ?? 0;

function localTimestamp() {
  const d = new Date();
  const o = -d.getTimezoneOffset();
  const s = o >= 0 ? '+' : '-';
  const pad = n => String(n).padStart(2, '0');
  const tz = s + pad(o / 60) + ':' + pad(o % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tz}`;
}

const MAX_LOG_SIZE = 5 * 1024 * 1024;

function sanitizeLogInput(v) {
  return String(v).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

function resolveLogPath() {
  const raw = process.env.CODEBASE_VIS_LOG_FILE;
  if (raw) {
    const resolved = path.resolve(raw);
    const cwdReal = (() => { try { return fs.realpathSync(process.cwd()) + path.sep; } catch { return process.cwd() + path.sep; } })();
    if (!resolved.startsWith(cwdReal)) {
      return path.join(process.cwd(), 'codebase-out', 'codebase-vis.log');
    }
    return resolved;
  }
  return path.join(process.cwd(), 'codebase-out', 'codebase-vis.log');
}

const logPath = resolveLogPath();

let logStream = null;
try {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch {}
  if (fs.existsSync(logPath)) {
    try { fs.chmodSync(logPath, 0o600); } catch {}
    if (fs.statSync(logPath).size > MAX_LOG_SIZE) {
      fs.truncateSync(logPath, 0);
    }
  }
  logStream = fs.createWriteStream(logPath, { flags: 'a', mode: 0o600 });
  try { fs.chmodSync(logPath, 0o600); } catch {}
  logStream.write(`--- Logger started at ${localTimestamp()} ---\n`);
} catch { }

function formatArgs(args) {
  return args.map(a => {
    const s = typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a);
    return sanitizeLogInput(s);
  }).join(' ');
}

function log(level, context, ...args) {
  if (level < currentLevel || !logStream) return;
  const ts = localTimestamp();
  const msg = formatArgs(args);
  const line = `[${ts}] [${LEVEL_NAMES[level]}] [${context}] ${msg}`;
  logStream.write(line + '\n');
}

export const logger = {
  debug:  (ctx, ...a) => log(0, ctx, ...a),
  info:   (ctx, ...a) => log(1, ctx, ...a),
  warn:   (ctx, ...a) => log(2, ctx, ...a),
  error:  (ctx, ...a) => log(3, ctx, ...a),
  fatal:  (ctx, ...a) => log(4, ctx, ...a),
};
