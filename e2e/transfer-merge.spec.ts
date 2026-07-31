import { test, expect, type Page } from '@playwright/test';

// End-to-end coverage for tracker#44: merging an existing income + expense pair
// on two DIFFERENT accounts into a single Transfer. Reuses the selection-driven
// Merge flow — the cross-account pair is only selectable together in the
// all-accounts view (tracker#43). The dialog switches to a transfer summary
// (income forced as survivor), and the backend converts the income into a
// Transfer and cancels the expense. Runs against a live backend (@local).

async function register(page: Page) {
  const email = `e2e-transfer-merge-${Date.now()}-${Math.floor(performance.now())}@example.com`;
  await page.goto('register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('longenough');
  await page.getByRole('button', { name: /^create account$/i }).click();
  await expect(page.getByText(/no accounts yet/i)).toBeVisible();
}

async function addAccount(page: Page, name: string, balance: string) {
  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill(name);
  await dialog.getByLabel(/initial balance/i).fill(balance);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(page.getByRole('link', { name: new RegExp(name, 'i') })).toBeVisible();
}

async function openAccount(page: Page, name: string) {
  await page.getByRole('link', { name: new RegExp(`^${name}\\b`, 'i') }).click();
}

// Records an expense (seeded "Groceries" category) on the currently open account.
async function addExpense(page: Page, amount: string, description: string) {
  await page.getByRole('button', { name: /^add expense$/i }).click();
  const dialog = page.getByRole('dialog', { name: /add expense/i });
  await dialog.getByLabel(/amount/i).fill(amount);
  const category = dialog.getByRole('combobox', { name: /category/i });
  await category.click();
  await category.fill('Groc');
  await dialog.getByRole('option', { name: 'Groceries' }).click();
  await dialog.getByLabel(/description/i).fill(description);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: description, exact: true })).toBeVisible({
    timeout: 10000,
  });
}

// Records an income (seeded "Salary" category) on the currently open account.
async function addIncome(page: Page, amount: string, description: string) {
  await page.getByRole('button', { name: /^add income$/i }).click();
  const dialog = page.getByRole('dialog');
  const category = dialog.getByRole('combobox', { name: /category/i }).first();
  await category.click();
  await category.fill('Sal');
  await dialog.getByRole('option', { name: 'Salary' }).click();
  await dialog
    .getByLabel(/amount/i)
    .first()
    .fill(amount);
  await dialog.getByLabel(/description/i).fill(description);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: description, exact: true })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('transfer-merge @local', () => {
  test('merge an income + expense on different accounts into a single transfer', async ({
    page,
  }) => {
    await register(page);
    await addAccount(page, 'Checking', '100');
    await addAccount(page, 'Savings', '0');

    // Phantom legs of one movement: $50 out of Checking, $50 into Savings.
    await openAccount(page, 'Checking');
    await addExpense(page, '50', 'MoveOut');
    await openAccount(page, 'Savings');
    await addIncome(page, '50', 'MoveIn');

    // Only the all-accounts view shows both legs together so they can be selected.
    await page.getByRole('link', { name: /all accounts/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole('cell', { name: 'MoveOut', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'MoveIn', exact: true })).toBeVisible();

    // Select both legs → the action bar appears; Merge is enabled for the pair.
    await page.getByRole('checkbox', { name: 'Select MoveIn' }).check();
    await page.getByRole('checkbox', { name: 'Select MoveOut' }).check();
    const bar = page.getByRole('region', { name: /selection actions/i });
    await expect(bar).toContainText(/2 selected/i);
    await bar.getByRole('button', { name: /merge selected/i }).click();

    // The dialog switches to the transfer summary (income is the survivor).
    const dialog = page.getByRole('dialog', { name: /merge into transfer/i });
    await expect(dialog).toBeVisible();
    const summary = dialog.getByTestId('transfer-summary');
    await expect(summary).toContainText('Checking'); // From = expense's account
    await expect(summary).toContainText('Savings'); // To = income's account
    await expect(summary).toContainText(/50\.00/);
    await expect(dialog.getByRole('radio')).toHaveCount(0);

    await dialog.getByRole('button', { name: /make transfer/i }).click();
    await expect(dialog).toBeHidden();

    // The income survivor is now a Transfer routed Checking → Savings; the
    // expense leg is cancelled (gone from the default view). (Clickable rows are
    // exposed as buttons, so assert on the individual cells.)
    await expect(page.getByRole('cell', { name: 'MoveIn', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Transfer' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Checking Savings' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'MoveOut', exact: true })).toHaveCount(0);

    // Reveal cancelled rows → the expense reappears, now Cancelled.
    await page.getByRole('button', { name: /^filters/i }).click();
    await page.getByRole('checkbox', { name: /cancelled & failed/i }).check();
    await expect(page.getByRole('cell', { name: 'MoveOut', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Cancelled' })).toBeVisible();
  });
});
