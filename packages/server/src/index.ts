import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleHttp } from './http.js';
import { Rooms } from './rooms.js';
import { attachWebSocket } from './ws.js';

const IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;

export interface StartOptions {
  staticDir?: string;
  seed?: () => number;
}

export async function start(
  port: number,
  opts: StartOptions = {},
): Promise<{ port: number; rooms: Rooms; server: Server; close(): Promise<void> }> {
  const rooms = new Rooms({ seed: opts.seed });
  const server = createServer(handleHttp(rooms, opts.staticDir));
  const wss = attachWebSocket(server, rooms);
  // Render's proxy keeps connections idle for up to a minute; Node's defaults (5 s) close them first, which shows up as 502s.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;
  // Bind explicitly to all IPv4 interfaces, as Render expects.
  await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));
  const timer = setInterval(() => rooms.cleanup(IDLE_LIMIT_MS), 60 * 60 * 1000);
  timer.unref();
  return {
    port: (server.address() as AddressInfo).port,
    rooms,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        for (const client of wss.clients) client.terminate();
        wss.close(() => {
          server.closeAllConnections();
          server.close(() => resolve());
        });
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Games live in memory, so one stray error should be logged, not allowed to end every game in progress.
  process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
  process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
  const port = Number(process.env.PORT ?? 3000);
  const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
  start(port, { staticDir }).then((s) => console.log(`IsaChess listening on http://localhost:${s.port}`));
}
