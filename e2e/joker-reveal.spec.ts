import { expect, test, type Page } from '@playwright/test';

// This file runs against a second server (see playwright.config.ts) whose seed deals
// White: 3, +2, 7, 8, Joker, 8, 9 and Black: 1, 5, 2, Reverse, Reverse, 7, +2.
test.use({ baseURL: 'http://localhost:4174' });

const sq = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);
const square = (page: Page, name: string) => page.getByTestId(`sq-${sq(name)}`);
const status = (page: Page) => page.getByTestId('status');

async function twoPlayers(browser: import('@playwright/test').Browser) {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('new-game').click();
  const link = await alice.getByTestId('copy-link').inputValue();
  const bob = await (await browser.newContext()).newPage();
  await bob.goto(link);
  await bob.getByTestId('nickname').fill('Bob');
  await bob.getByTestId('join-game').click();
  await expect(status(alice)).toHaveText('Your turn: play a card');
  return { alice, bob };
}

test('a Joker becomes any card you choose', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser);
  await alice.locator('[data-testid=hand] button', { hasText: 'Joker' }).first().click();
  const dialog = alice.getByRole('dialog', { name: 'Joker: become which card?' });
  await expect(dialog).toBeVisible();
  await dialog.getByTitle('5 moves').click();
  await expect(status(alice)).toHaveText('Card 5: move 1 of 5');
  await expect(bob.getByTestId('log')).toContainText('Alice played Joker as 5');
});

test('a checkmated player sees the winner\'s hand', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser);
  await alice.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  await square(alice, 'f2').click();
  await square(alice, 'f3').click();
  await square(alice, 'g2').click();
  await square(alice, 'g4').click();
  await alice.getByTestId('done-moving').click().catch(() => undefined);
  await expect(status(bob)).toHaveText('Your turn: play a card');
  await bob.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  await square(bob, 'e7').click();
  await square(bob, 'e5').click();
  await square(bob, 'd8').click();
  await square(bob, 'h4').click();
  await expect(bob.getByTestId('result')).toHaveText('You win!');
  await expect(alice.getByTestId('result')).toHaveText('Bob wins');
  await expect(alice.getByTestId('revealed-hand').locator('button')).toHaveCount(7);
  await expect(bob.getByTestId('revealed-hand')).toHaveCount(0);
});
