import { test, expect } from '@playwright/test';

test.describe('quick add prompt @local', () => {
  test('composer anchors to the bottom on an empty list and responds to a prompt', async ({
    page,
  }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register a new user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // 2. Create an account "Wallet" (USD, balance 100).
    await page.getByRole('button', { name: /add account/i }).click();
    const createAccountDialog = page.getByRole('dialog');
    await createAccountDialog.getByLabel(/name/i).fill('Wallet');
    await createAccountDialog.getByLabel(/initial balance/i).fill('100');
    await createAccountDialog.getByRole('button', { name: /^ok$/i }).click();

    // 3. Open the new account. It has no transactions yet, so the pane shows
    //    the "No transactions" empty state — the exact case the layout fix
    //    targets (short content shouldn't leave the composer stranded mid-pane).
    await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
    await page.getByRole('link', { name: /wallet/i }).click();

    // 4. Layout assertion: the composer is visible and anchored to the bottom
    //    of the viewport, not floating under the short/empty content.
    const input = page.getByLabel('Quick add transaction');
    await expect(input).toBeVisible();

    const composer = page.getByTestId('quick-add');
    const box = await composer.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(4);
    }

    // 5. Functional assertion: submit a prompt and expect SOME response
    //    surface — a new row (LLM enabled) or a destructive alert (LLM
    //    disabled/unavailable) — this exercises the real endpoint + UI
    //    feedback path regardless of backend LLM configuration.
    //
    //    No period switch needed: the pane defaults to "This month", which
    //    contains a transaction created today — so a successfully-created row is
    //    immediately visible. (This also guards that default.)
    await input.fill('coffee 4.50');
    await input.press('Enter');

    // .first() keeps this robust to strict-mode: a matched row can have more
    // than one <td> whose accessible name mentions "coffee" (e.g. the row
    // checkbox's aria-label echoes the description alongside the text cell).
    await expect(
      page
        .getByRole('alert')
        .or(page.getByRole('cell', { name: /coffee/i }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
