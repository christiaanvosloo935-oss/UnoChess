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

  // Chat reaches the other player, nicknames are shown, and nothing is rendered as HTML.
  await alice.getByTestId('chat-input').fill('hello <b>Bob</b>');
  await alice.getByTestId('chat-send').click();
  await expect(bob.getByTestId('chat-list')).toContainText('Alice');
  await expect(bob.getByTestId('chat-list')).toContainText('hello <b>Bob</b>');
  await expect(alice.getByTestId('chat-list')).toContainText('hello <b>Bob</b>');
  await expect(alice.getByTestId('chat-input')).toHaveValue('');
  await bob.getByTestId('chat-input').fill('hi Alice');
  await bob.getByTestId('chat-input').press('Enter');
  await expect(alice.getByTestId('chat-list')).toContainText('hi Alice');

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
  // Chat is not saved: after a refresh the conversation starts empty.
  await expect(alice.getByTestId('chat-list')).not.toContainText('hi Alice');
});

test('chat works while waiting in the lobby, and the input sits at the bottom of a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const alice = await context.newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('new-game').click();
  await alice.getByTestId('copy-link').waitFor();
  await alice.getByTestId('chat-input').fill('waiting…');
  await alice.getByTestId('chat-send').click();
  await expect(alice.getByTestId('chat-list')).toContainText('waiting…');

  const link = await alice.getByTestId('copy-link').inputValue();
  const bob = await (await browser.newContext({ viewport: { width: 375, height: 700 } })).newPage();
  await bob.goto(link);
  await bob.getByTestId('nickname').fill('Bob');
  await bob.getByTestId('join-game').click();
  await expect(status(alice)).toHaveText('Your turn: play a card');
  const box = (await alice.getByTestId('chat-input').boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(700 - 90);
  expect(box.y + box.height).toBeLessThanOrEqual(700);
});

/** Records every Element.animate() call and every capture ghost the page creates. */
const RECORDER = () => {
  const w = window as unknown as { __anim: { calls: { alt: string; transform: boolean }[]; ghosts: number } };
  w.__anim = { calls: [], ghosts: 0 };
  const original = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const list = (Array.isArray(keyframes) ? keyframes : []) as Keyframe[];
    w.__anim.calls.push({ alt: this.getAttribute('alt') ?? this.className.toString(), transform: list.some((k) => k.transform !== undefined) });
    return original.call(this, keyframes, options);
  };
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if ((n as Element).classList?.contains('ghost')) w.__anim.ghosts++;
  }).observe(document, { childList: true, subtree: true });
};
const animCalls = (page: Page, alt: string) =>
  page.evaluate((a) => (window as unknown as { __anim: { calls: { alt: string; transform: boolean }[] } }).__anim.calls.filter((c) => c.alt === a && c.transform).length, alt);
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));

async function twoPlayers(browser: import('@playwright/test').Browser, bobOptions: Parameters<import('@playwright/test').Browser['newContext']>[0] = {}) {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByTestId('nickname').fill('Alice');
  await alice.getByTestId('new-game').click();
  const link = await alice.getByTestId('copy-link').inputValue();
  const bobContext = await browser.newContext(bobOptions);
  await bobContext.addInitScript(RECORDER);
  const bob = await bobContext.newPage();
  await bob.goto(link);
  await bob.getByTestId('nickname').fill('Bob');
  await bob.getByTestId('join-game').click();
  await expect(status(alice)).toHaveText('Your turn: play a card');
  return { alice, bob };
}

test('pieces slide, captures fade, and nothing is left behind', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser);
  await expect(bob.getByTestId('chat-input')).toBeVisible();
  expect(await animCalls(bob, 'white pawn')).toBe(0); // the first state is not animated

  // White plays e2-e4 and d2-d4 with the 4-move card; Black's page animates both slides.
  await alice.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  await square(alice, 'e2').click();
  await square(alice, 'e4').click();
  await square(alice, 'd2').click();
  await square(alice, 'd4').click();
  await alice.getByTestId('done-moving').click();
  await expect.poll(() => animCalls(bob, 'white pawn')).toBe(2);
  await settle(bob);
  await expect(square(bob, 'e4').locator('img')).toHaveAttribute('alt', 'white pawn');
  await expect(square(bob, 'd4').locator('img')).toHaveAttribute('alt', 'white pawn');
  await expect(square(bob, 'e2').locator('img')).toHaveCount(0);

  // Black answers e7-e5, then White captures d4xe5 with the 1-move card.
  await expect(status(bob)).toHaveText('Your turn: play a card');
  await bob.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  await square(bob, 'e7').click();
  await square(bob, 'e5').click();
  await bob.getByTestId('done-moving').click();
  await expect(status(alice)).toHaveText('Your turn: play a card');
  await alice.locator('[data-testid=hand] button', { hasText: '1 move' }).click();
  await square(alice, 'd4').click();
  await square(alice, 'e5').click();
  await expect.poll(() => bob.evaluate(() => (window as unknown as { __anim: { ghosts: number } }).__anim.ghosts)).toBe(1);
  await settle(bob);
  await expect(bob.locator('.ghost')).toHaveCount(0);
  await expect(square(bob, 'e5').locator('img')).toHaveCount(1);
  await expect(square(bob, 'e5').locator('img')).toHaveAttribute('alt', 'white pawn');
  await expect(square(bob, 'd4').locator('img')).toHaveCount(0);
});

test('no animation on a refresh, and none when the device asks for reduced motion', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser);
  await bob.reload();
  await expect(status(bob)).toHaveText("Alice's turn");
  expect(await bob.evaluate(() => (window as unknown as { __anim: { calls: unknown[] } }).__anim.calls.length)).toBe(0);
  await alice.close();

  const calm = await twoPlayers(browser, { reducedMotion: 'reduce' });
  await calm.alice.locator('[data-testid=hand] button', { hasText: 'moves' }).first().click();
  await square(calm.alice, 'e2').click();
  await square(calm.alice, 'e4').click();
  await calm.alice.getByTestId('done-moving').click();
  await expect(square(calm.bob, 'e4').locator('img')).toHaveAttribute('alt', 'white pawn');
  expect(await animCalls(calm.bob, 'white pawn')).toBe(0);
});

test('the card guide explains every card, marks the ones you hold, and keeps the chat', async ({ browser }) => {
  const { alice } = await twoPlayers(browser);
  await alice.getByTestId('chat-input').fill('still here');
  await alice.getByTestId('chat-send').click();
  await expect(alice.getByTestId('chat-list')).toContainText('still here');
  await alice.getByTestId('chat-input').fill('draft message');

  await alice.getByTestId('tab-cards').click();
  await expect(alice.getByTestId('card-guide')).toBeVisible();
  await expect(alice.getByTestId('guide-entry')).toHaveCount(11);
  await expect(alice.getByTestId('guide-entry').filter({ hasText: 'Freeze' })).toContainText("can't move on their next turn");
  // Seed 1 deals White: 6, 4, 7, 1, Reverse, +4, 8, so six different guide entries are marked as held.
  await expect(alice.locator('[data-testid=guide-entry].held')).toHaveCount(6);
  await expect(alice.getByTestId('guide-entry').filter({ hasText: 'Trade' })).not.toHaveClass(/held/);
  await expect(alice.getByTestId('chat-list')).toBeHidden();

  await alice.getByTestId('tab-chat').click();
  await expect(alice.getByTestId('chat-list')).toContainText('still here');
  await expect(alice.getByTestId('chat-input')).toHaveValue('draft message');
  await expect(alice.getByTestId('card-guide')).toBeHidden();
});

test('the guide is also available from the home page and the waiting room', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-guide').click();
  await expect(page.getByTestId('guide-entry')).toHaveCount(11);
  await page.getByTestId('guide-close').click();
  await expect(page.getByTestId('card-guide')).toBeHidden();

  await page.getByTestId('nickname').fill('Alice');
  await page.getByTestId('new-game').click();
  await page.getByTestId('copy-link').waitFor();
  await page.getByTestId('home-guide').click();
  await expect(page.getByTestId('guide-entry')).toHaveCount(11);
  await expect(page.locator('[data-testid=guide-entry].held')).toHaveCount(0);
});

test('hovering a board square or a card never changes its colour', async ({ browser }) => {
  const { alice } = await twoPlayers(browser);
  const background = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);

  const e4 = square(alice, 'e4');
  const squareBefore = await background(e4);
  await e4.hover();
  await alice.waitForTimeout(250); // let any colour transition finish before reading the style
  expect(await background(e4)).toBe(squareBefore);

  const card = alice.locator('[data-testid=hand] button').first();
  const cardBefore = await background(card);
  await card.hover();
  await alice.waitForTimeout(250); // let the hover lift transition finish
  expect(await background(card)).toBe(cardBefore);

  // Quiet buttons get their own light hover colour, never the blue of the main buttons.
  await alice.getByRole('button', { name: 'Resign' }).hover();
  await alice.waitForTimeout(250);
  expect(await background(alice.getByRole('button', { name: 'Resign' }))).toBe('rgb(250, 246, 239)');
  await alice.getByTestId('tab-cards').hover();
  await alice.waitForTimeout(250);
  expect(await background(alice.getByTestId('tab-cards'))).toBe('rgb(230, 220, 203)');
});

test('the logo shows on the home page and the web-app files are served', async ({ page, request }) => {
  await page.goto('/');
  const logo = page.getByAltText('IsaChess logo').first();
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://isachess.onrender.com/og-image.png');

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.headers()['content-type']).toContain('application/manifest+json');
  const data = await manifest.json();
  expect(data).toMatchObject({ name: 'IsaChess', display: 'standalone', start_url: '/' });
  for (const icon of data.icons) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
  for (const file of ['/favicon.svg', '/logo.svg', '/apple-touch-icon.png', '/og-image.png']) {
    expect((await request.get(file)).status()).toBe(200);
  }
});
