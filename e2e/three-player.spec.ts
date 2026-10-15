import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, index: number) => page.getByTestId(`sq-${index}`);
const status = (page: Page) => page.getByTestId('status');

async function playMoveCard(page: Page, from: number, to: number) {
  await page.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  await square(page, from).click();
  await square(page, to).click();
  await page.getByTestId('done-moving').click();
}

async function join(browser: import('@playwright/test').Browser, link: string, nick: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  await page.getByTestId('nickname').fill(nick);
  await page.getByTestId('join-game').click();
  return page;
}

test('three players create, join, play turns, see a full game, and one resigns', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('new-game-3').click();
  await expect(alice.getByRole('heading', { name: /Waiting for 2 more players/ })).toBeVisible();
  const link = await alice.getByTestId('copy-link').inputValue();
  expect(link).toMatch(/\/g\/[a-z0-9]{6}$/);

  const bob = await join(browser, link, 'Bob');
  await expect(alice.getByRole('heading', { name: /Waiting for 1 more player…/ })).toBeVisible();
  await expect(bob.getByRole('heading', { name: /Waiting for 1 more player…/ })).toBeVisible();

  const carol = await join(browser, link, 'Carol');
  await expect(status(alice)).toHaveText('Your turn: play a card');
  await expect(status(bob)).toHaveText(/^Alice's turn/);
  await expect(status(carol)).toHaveText(/^Alice's turn/);

  // Everyone sees two opponents, shown only as card counts, never as card faces.
  for (const page of [alice, bob, carol]) {
    await expect(page.locator('[data-testid^=opponent-]')).toHaveCount(2);
    await expect(page.locator('[data-testid^=opponent-] .card-back')).toHaveCount(2);
    await expect(page.locator('[data-testid^=opponent-] [data-testid^=card-]')).toHaveCount(0);
    await expect(page.locator('[data-testid^=opponent-] .card-back span').first()).toHaveText('7');
    await expect(page.locator('[data-testid=hand] button')).toHaveCount(7);
  }

  // Alice (White) pushes e2-e4 (sq-12 to sq-28).
  await playMoveCard(alice, 12, 28);
  await expect(status(bob)).toHaveText('Your turn: play a card');
  await expect(status(alice)).toHaveText(/^Bob's turn/);
  await expect(status(carol)).toHaveText(/^Bob's turn/);
  await expect(square(bob, 28).locator('img')).toHaveAttribute('alt', 'white pawn');
  await expect(square(carol, 28).locator('img')).toHaveAttribute('alt', 'white pawn');

  // Bob (Red) pushes his e2 (sq-44) to his e4 (sq-60).
  await playMoveCard(bob, 44, 60);
  await expect(status(carol)).toHaveText('Your turn: play a card');
  await expect(status(alice)).toHaveText(/^Carol's turn/);
  await expect(status(bob)).toHaveText(/^Carol's turn/);
  await expect(square(alice, 60).locator('img')).toHaveAttribute('alt', 'red pawn');

  // A fourth visitor finds the game full.
  const dave = await join(browser, link, 'Dave');
  await expect(dave.getByText('This game is full.')).toBeVisible();

  // Carol (Black) resigns: she is marked Eliminated and the game goes on.
  carol.once('dialog', (d) => void d.accept());
  await carol.getByRole('button', { name: 'Resign' }).click();
  for (const page of [alice, bob]) {
    await expect(page.locator('[data-testid^=opponent-].out')).toHaveCount(1);
    await expect(page.locator('[data-testid^=opponent-].out')).toContainText('Eliminated');
  }
  await expect(status(alice)).toHaveText('Your turn: play a card');
  await expect(status(bob)).toHaveText(/^Alice's turn/);
  await expect(alice.getByTestId('result')).toHaveCount(0);
});
