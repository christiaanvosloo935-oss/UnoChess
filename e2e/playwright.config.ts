import { defineConfig } from '@playwright/test';

// Seed 1 deals White: 6, 9, 2, 4, 4, Reverse, Skip and Black: 7, 6, 2, Skip, Skip, 4, 5
// (a third player, in a 3-player game, gets 7, 9, 1, 3, +2, 5, 5).
// White therefore has a multi-move card and a Swap, and Black has a multi-move card, so the
// scripted game in game.spec.ts is deterministic.
export const SEED = 1;
const PORT = 4173;
// A second server for joker-reveal.spec.ts. Seed 23 deals White: 3, +2, 7, 8, Joker, 8, 9
// and Black: 1, 5, 2, Reverse, Reverse, 7, +2, so White holds a Joker and both can play a multi-move card.
const JOKER_SEED = 23;
const JOKER_PORT = 4174;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run build && (PORT=${JOKER_PORT} ISACHESS_SEED=${JOKER_SEED} node packages/server/dist/index.js & exec npm start)`,
    cwd: new URL('..', import.meta.url).pathname,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { PORT: String(PORT), ISACHESS_SEED: String(SEED) },
  },
});
