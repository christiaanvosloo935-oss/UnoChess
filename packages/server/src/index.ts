import { createServer } from 'node:http';
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
): Promise<{ port: number; rooms: Rooms; close(): Promise<void> }> {
  const rooms = new Rooms({ seed: opts.seed });
  const server = createServer(handleHttp(rooms, opts.staticDir));
  const wss = attachWebSocket(server, rooms);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const timer = setInterval(() => rooms.cleanup(IDLE_LIMIT_MS), 60 * 60 * 1000);
  timer.unref();
  return {
    port: (server.address() as AddressInfo).port,
    rooms,
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
  const port = Number(process.env.PORT ?? 3000);
  const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
  start(port, { staticDir }).then((s) => console.log(`Uno Chess listening on http://localhost:${s.port}`));
}
