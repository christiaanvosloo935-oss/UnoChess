import { expect, test, type Browser, type Page } from '@playwright/test';

const sq = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);
const square = (page: Page, name: string) => page.getByTestId(`sq-${sq(name)}`);
const status = (page: Page) => page.getByTestId('status');

// Seed 1 deals White: 6, 4, 7, 1, Reverse, +4, 8 and Black: Reverse, 0, 0, Wild, 2, 3, 2.
async function twoPlayers(browser: Browser, aliceColour: string, bobColour: string) {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId(`colour-${aliceColour}`).click();
  await alice.getByTestId('new-game').click();
  const link = await alice.getByTestId('copy-link').inputValue();
  const bob = await (await browser.newContext()).newPage();
  await bob.goto(link);
  await bob.getByTestId('nickname').fill('Bob');
  await bob.getByTestId(`colour-${bobColour}`).click();
  await bob.getByTestId('join-game').click();
  await expect(status(alice)).toHaveText('Your turn: play a card');
  return { alice, bob };
}

async function fourMovesThenStop(page: Page, moves: [string, string][]) {
  await page.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  for (const [from, to] of moves) {
    await square(page, from).click();
    await square(page, to).click();
  }
  await page.getByTestId('done-moving').click();
}

test('each player picks their piece colour and both see both colours', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser, 'violet', 'orange');
  for (const page of [alice, bob]) {
    await expect(square(page, 'e2').locator('img')).toHaveAttribute('src', '/pieces/violet/P.svg');
    await expect(square(page, 'e7').locator('img')).toHaveAttribute('src', '/pieces/orange/P.svg');
  }
});

test('on a join link the creator\'s colour is taken, and black and white are real choices', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('colour-black').click();
  await alice.getByTestId('new-game').click();
  const link = await alice.getByTestId('copy-link').inputValue();
  const bob = await (await browser.newContext()).newPage();
  await bob.goto(link);
  await expect(bob.getByTestId('colour-black')).toBeDisabled();
  await expect(bob.getByTestId('colour-white')).toBeEnabled();
  await bob.getByTestId('nickname').fill('Bob');
  await bob.getByTestId('join-game').click();
  await expect(status(bob)).toHaveText("Alice's turn");
  await expect(square(bob, 'e2').locator('img')).toHaveAttribute('src', '/pieces/bP.svg');
  await expect(square(bob, 'e7').locator('img')).toHaveAttribute('src', '/pieces/wP.svg');
});

test('a Joker becomes any card you choose', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser, 'white', 'black');
  await fourMovesThenStop(alice, [['e2', 'e4']]);
  await expect(status(bob)).toHaveText('Your turn: play a card');
  await bob.locator('[data-testid=hand] button', { hasText: 'Joker' }).first().click();
  const dialog = bob.getByRole('dialog', { name: 'Joker: become which card?' });
  await expect(dialog).toBeVisible();
  await dialog.getByTitle('5 moves').click();
  await expect(status(bob)).toHaveText('Card 5: move 1 of 5');
  await expect(alice.getByTestId('log')).toContainText('Bob played Joker as 5');
});

test('a checkmated player sees the winner\'s hand', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser, 'white', 'black');
  await fourMovesThenStop(alice, [['f2', 'f3'], ['g2', 'g4']]);
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
