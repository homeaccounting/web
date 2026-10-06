import { test, expect, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

// Issue #11: a cross-currency transfer can be entered as amount + rate (target
// derived) or as amount + target amount (rate derived). Runs against a live
// backend (@local) so the booked target balance proves the derived rate
// reproduces the entered target exactly.

async function addAccount(page: Page, name: string, currency: string, balance: string) {
  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill(name);
  await dialog.getByRole('combobox', { name: 'Currency' }).click();
  await page.getByRole('option', { name: currency }).click();
  await dialog.getByLabel(/initial balance/i).fill(balance);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(page.getByRole('link', { name: new RegExp(name, 'i') })).toBeVisible();
}

async function openTransfer(page: Page) {
  await page.getByRole('button', { name: /^add transfer$/i }).click();
  const dialog = page.getByRole('dialog', { name: /add transfer/i });
  await dialog.getByRole('combobox', { name: /source account/i }).click();
  await page.getByRole('option', { name: /dollars/i }).click();
  await dialog.getByRole('combobox', { name: /target account/i }).click();
  await page.getByRole('option', { name: /euros/i }).click();
  return dialog;
}

test.describe('transfer exchange rate @local', () => {
  test('derives the target from the rate, and the rate from the target', async ({ page }) => {
    await page.goto('register');
    await page.getByLabel(/email/i).fill(`e2e-fx-${Date.now()}@example.com`);
    await page.getByLabel(/password/i).fill('longenough');
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await addAccount(page, 'Dollars', 'USD', '1000');
    await addAccount(page, 'Euros', 'EUR', '0');
    const euros = page.getByRole('link', { name: /euros/i });

    // Flow 1: amount + target amount → rate derived.
    let dialog = await openTransfer(page);
    await dialog.getByRole('spinbutton', { name: /^amount/i }).fill('3');
    await dialog.getByLabel(/target amount/i).fill('1');
    await expect(dialog.getByLabel(/exchange rate/i)).toHaveValue('0.333333333333');
    await dialog.screenshot({ path: 'test-results/transfer-target-amount.png' });
    const booked = page.waitForResponse(
      (r) => r.url().endsWith('/api/transactions/transfer') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    // The displayed balance is rounded; the response shows the exact booked amount.
    const body = (await (await booked).json()) as { targetAmount: number };
    expect(body.targetAmount).toBeCloseTo(1, 9);
    await expect(dialog).toBeHidden();
    await expect(euros).toContainText(/1\.00/);

    // Flow 2: amount + rate → target derived.
    dialog = await openTransfer(page);
    await dialog.getByRole('spinbutton', { name: /^amount/i }).fill('100');
    await dialog.getByLabel(/exchange rate/i).fill('0.9237');
    await expect(dialog.getByLabel(/target amount/i)).toHaveValue('92.37');
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(dialog).toBeHidden();
    await expect(euros).toContainText(/93\.37/);
  });
});
