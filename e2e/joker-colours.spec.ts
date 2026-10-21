import { expect, test, type Browser, type Page } from '@playwright/test';

const sq = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);
const square = (page: Page, at: string | number) => page.getByTestId(`sq-${typeof at === 'number' ? at : sq(at)}`);
const status = (page: Page) => page.getByTestId('status');

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

test('in a three-player game each army wears its owner\'s colour for everyone', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('colour-violet').click();
  await alice.getByTestId('new-game-3').click();
  const link = await alice.getByTestId('copy-link').inputValue();
  const others: Page[] = [];
  for (const [nick, colour] of [['Bob', 'orange'], ['Carol', 'green']]) {
    const page = await (await browser.newContext()).newPage();
    await page.goto(link);
    await page.getByTestId('nickname').fill(nick);
    await page.getByTestId(`colour-${colour}`).click();
    await page.getByTestId('join-game').click();
    others.push(page);
  }
  for (const page of [alice, ...others]) {
    await expect(square(page, 12).locator('img')).toHaveAttribute('src', '/pieces/violet/P.svg');
    await expect(square(page, 44).locator('img')).toHaveAttribute('src', '/pieces/orange/P.svg');
    await expect(square(page, 76).locator('img')).toHaveAttribute('src', '/pieces/green/P.svg');
  }
});
