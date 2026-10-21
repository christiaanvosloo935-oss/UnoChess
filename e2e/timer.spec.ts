import { expect, test, type Browser, type Page } from '@playwright/test';

// Runs against a server where a turn lasts 2 seconds (see playwright.config.ts).
test.use({ baseURL: 'http://localhost:4175' });

const status = (page: Page) => page.getByTestId('status');

async function join(browser: Browser, link: string, nick: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  await page.getByTestId('nickname').fill(nick);
  await page.getByTestId('join-game').click();
  return page;
}

test('a turn that is not played within the time limit is skipped (two players)', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('new-game').click();
  const bob = await join(browser, await alice.getByTestId('copy-link').inputValue(), 'Bob');
  await expect(status(alice)).toHaveText('Your turn: play a card');
  await expect(alice.getByTestId('turn-timer')).toContainText('0:0');
  await expect(status(alice)).toHaveText("Bob's turn", { timeout: 6000 });
  await expect(alice.getByTestId('log')).toContainText('Alice ran out of time and skips their turn');
  await expect(bob.getByTestId('log')).toContainText('Alice ran out of time and skips their turn');
});

test('and the same in a three-player game', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('new-game-3').click();
  const link = await alice.getByTestId('copy-link').inputValue();
  await join(browser, link, 'Bob');
  const carol = await join(browser, link, 'Carol');
  await expect(status(alice)).toHaveText('Your turn: play a card');
  await expect(carol.getByTestId('turn-timer')).toBeVisible();
  await expect(status(alice)).toHaveText(/^Bob's turn/, { timeout: 6000 });
  await expect(carol.getByTestId('log')).toContainText('Alice ran out of time and skips their turn');
});
