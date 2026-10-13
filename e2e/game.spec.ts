import { expect, test, type Page } from '@playwright/test';

const sq = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);
const square = (page: Page, name: string) => page.getByTestId(`sq-${sq(name)}`);
const status = (page: Page) => page.getByTestId('status');

async function playMoveCard(page: Page, from: string, to: string) {
  await page.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  await square(page, from).click();
  await square(page, to).click();
  await page.getByTestId('done-moving').click();
}

test('two players create, join, and play', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('new-game').click();
  const link = await alice.getByTestId('copy-link').inputValue();
  expect(link).toMatch(/\/g\/[a-z0-9]{6}$/);

  const bob = await (await browser.newContext()).newPage();
  await bob.goto(link);
  await bob.getByTestId('nickname').fill('Bob');
  await bob.getByTestId('join-game').click();
  await expect(status(alice)).toHaveText('Your turn: play a card');
  await expect(status(bob)).toHaveText("Alice's turn");

  // Alice (White) plays a multi-move card and pushes e2-e4, then stops early.
  await playMoveCard(alice, 'e2', 'e4');
  await expect(status(bob)).toHaveText('Your turn: play a card');
  await expect(square(bob, 'e4').locator('img')).toHaveAttribute('alt', 'white pawn');

  // Bob (Black) answers with e7-e5.
  await playMoveCard(bob, 'e7', 'e5');
  await expect(status(alice)).toHaveText('Your turn: play a card');

  // Alice swaps her a1 rook and b1 knight.
  const glyph = (page: Page, name: string) => square(page, name).locator('img').getAttribute('alt');
  const rook = await glyph(alice, 'a1');
  const knight = await glyph(alice, 'b1');
  expect(rook).not.toBe(knight);
  await alice.locator('[data-testid=hand] button', { hasText: 'Swap' }).click();
  await expect(status(alice)).toHaveText('Swap: pick two of your pieces');
  await square(alice, 'a1').click();
  await square(alice, 'b1').click();
  await expect(square(alice, 'a1').locator('img')).toHaveAttribute('alt', knight!);
  await expect(square(alice, 'b1').locator('img')).toHaveAttribute('alt', rook!);
  await expect(status(bob)).toHaveText('Your turn: play a card');

  // Refreshing keeps the seat, the hand and the board.
  const handBefore = await alice.locator('[data-testid=hand] button').count();
  await alice.reload();
  await expect(status(alice)).toHaveText("Bob's turn");
  expect(await alice.locator('[data-testid=hand] button').count()).toBe(handBefore);
  await expect(square(alice, 'a1').locator('img')).toHaveAttribute('alt', knight!);
});
