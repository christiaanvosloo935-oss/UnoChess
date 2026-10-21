import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { parseColour, type Rooms } from './rooms.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const MAX_BODY = 4096;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function createGame(req: IncomingMessage, res: ServerResponse, rooms: Rooms): Promise<void> {
  let nickname: unknown;
  let variant: unknown;
  let colour: unknown;
  try {
    ({ nickname, variant, colour } = JSON.parse(await readBody(req)) as { nickname?: unknown; variant?: unknown; colour?: unknown });
  } catch {
    return json(res, 400, { error: 'Bad request' });
  }
  if (typeof nickname !== 'string' || nickname.trim().length < 1 || nickname.trim().length > 20) {
    return json(res, 400, { error: 'Nickname must be 1–20 characters.' });
  }
  if (variant !== undefined && variant !== 'classic' && variant !== 'three') {
    return json(res, 400, { error: "Variant must be 'classic' or 'three'." });
  }
  json(res, 200, rooms.create(nickname, variant ?? 'classic', parseColour(colour)));
}

async function serveStatic(staticDir: string, pathname: string, res: ServerResponse): Promise<void> {
  const root = resolve(staticDir);
  let file = root;
  try {
    const target = normalize(join(root, decodeURIComponent(pathname)));
    if (target === root || target.startsWith(root + sep)) file = target;
  } catch {
    file = root;
  }
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const data = await readFile(file);
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(data);
}

export function handleHttp(rooms: Rooms, staticDir?: string) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    // A malformed request line (bots send them all day) must never throw out of the handler and take the server down.
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
      res.end('Bad request');
      return;
    }
    const run = async () => {
      if (req.method === 'POST' && pathname === '/api/games') return createGame(req, res, rooms);
      const game = /^\/api\/games\/([a-z0-9]+)$/i.exec(pathname);
      if (req.method === 'GET' && game) {
        const colours = rooms.takenColours(game[1]);
        return colours ? json(res, 200, { colours }) : json(res, 404, { error: 'Not found' });
      }
      if (req.method === 'GET' && staticDir && !pathname.startsWith('/api/')) return serveStatic(staticDir, pathname, res);
      res.writeHead(404);
      res.end('Not found');
    };
    run().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  };
}
