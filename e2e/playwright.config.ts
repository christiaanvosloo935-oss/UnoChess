import { defineConfig } from '@playwright/test';

// Seed 1 deals White: 6, 4, 7, 1, Reverse, +4, 8 and Black: Reverse, 0, 0, Wild, 2, 3, 2.
// White therefore has a multi-move card and a Swap, and Black has a multi-move card, so the
// scripted game in game.spec.ts is deterministic.
export const SEED = 1;
const PORT = 4173;

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
    command: 'npm run build && npm start',
    cwd: new URL('..', import.meta.url).pathname,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { PORT: String(PORT), ISACHESS_SEED: String(SEED) },
  },
});
