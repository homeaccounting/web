import { test, expect } from '@playwright/test';

// SKIPPED: this smoke test requires a backend running with the banking feature
// ENABLED (configuration `bankingFeatureEnabled: true`). Unlike the unit/component
// suite, the e2e suite runs against a real dev server (`pnpm dev`,
// baseURL http://localhost:5173/app/), NOT MSW — so there is no way to stub the
// banking endpoints here. The banking backend PR is not merged/running in CI yet,
// so the `/profile/banking` tab is gated off and "Add connection" would 404.
//
// To enable later: point the e2e dev server at a banking-enabled backend
// (VITE_API_BASE_URL) and remove the `.skip` below. Everything else in this spec
// is written against the real UI (see ProfileBankingPane / BankConnectionDialog)
// and should pass as-is once the backend is available.
test.describe('banking @local', () => {
  test.skip('add a bank connection → listed with masked token', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register a fresh user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Go straight to the Banking tab. The tab/route is only reachable when the
    // backend reports `bankingFeatureEnabled` (gated in the Profile tab list).
    await page.goto('profile/banking');
    await expect(page).toHaveURL(/\/profile\/banking/);
    await expect(page.getByRole('tab', { name: /banking/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // No connections to start.
    await expect(page.getByText(/no connections yet/i)).toBeVisible();

    // Open the Add connection dialog and fill it.
    await page.getByRole('button', { name: /add connection/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('My Monobank');
    // Provider is fixed to monobank (disabled select).
    await dialog.getByLabel('Token').fill('test-token-1234567890');
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(dialog).toBeHidden();

    // The connection is listed with its provider badge and a masked token hint
    // ("•••• <tokenHint>" — the backend never returns the raw token).
    await expect(page.getByText('My Monobank')).toBeVisible();
    await expect(page.getByText('monobank')).toBeVisible();
    await expect(page.getByText(/••••/)).toBeVisible();
  });

  // File-provider flow (privatbank): a connection is created UNMAPPED, its
  // external accounts are discovered from an uploaded statement inside "Link
  // accounts", mapped to local accounts, and finally statements are imported
  // (multi-file) from the account view. Same real-backend caveat as above:
  // this needs a banking-enabled backend whose provider list reports privatbank
  // with supportsFile:true, so it stays skipped until that backend runs here.
  test.skip('file provider: link accounts from a statement → multi-file import', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // A tiny statement CSV. The real backend parses this to discover accounts;
    // the columns here are illustrative — swap for the provider's real format.
    const statement = (rows: string) => ({
      name: 'statement.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`date,amount,currency,iban\n${rows}\n`),
    });

    // Register a fresh user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Create a local account to receive the imported transactions. Its currency
    // must match the discovered external account (the mapping only offers
    // same-currency locals).
    await page.getByRole('button', { name: /add account/i }).click();
    const acctDialog = page.getByRole('dialog');
    await acctDialog.getByLabel(/name/i).fill('Hryvnia');
    await acctDialog.getByRole('combobox', { name: 'Currency' }).click();
    await page.getByRole('option', { name: 'UAH' }).click();
    await acctDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(page.getByRole('link', { name: /hryvnia/i })).toBeVisible();

    // Go to the Banking tab and add a PrivatBank (file-only) connection. A
    // file-only provider shows no Token field — the connection is created
    // unmapped ("0 mapped").
    await page.goto('profile/banking');
    await expect(page.getByText(/no connections yet/i)).toBeVisible();
    await page.getByRole('button', { name: /add connection/i }).click();
    const addDialog = page.getByRole('dialog');
    await addDialog.getByLabel('Name').fill('My PrivatBank');
    await addDialog.getByRole('combobox', { name: 'Provider' }).click();
    await page.getByRole('option', { name: /privatbank/i }).click();
    await addDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(addDialog).toBeHidden();
    await expect(page.getByText('My PrivatBank')).toBeVisible();
    await expect(page.getByText(/0 mapped/i)).toBeVisible();

    // Open "Link accounts" and upload a statement to discover accounts.
    await page.getByRole('button', { name: /link accounts/i }).click();
    const linkDialog = page.getByRole('dialog');
    await expect(linkDialog.getByText(/upload your statement/i)).toBeVisible();
    await linkDialog
      .getByLabel(/statement files/i)
      .setInputFiles(statement('2026-07-01,100,UAH,UA00'));

    // A row per discovered account appears; map the first to our local account.
    const firstMap = linkDialog.getByRole('combobox').first();
    await expect(firstMap).toBeVisible();
    await firstMap.click();
    await page.getByRole('option', { name: /hryvnia/i }).click();
    await linkDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(linkDialog).toBeHidden();
    await expect(page.getByText(/1 mapped/i)).toBeVisible();

    // From the account view, import statements (multi-file) via the toolbar
    // upload button; assert the success summary toast.
    await page.getByRole('link', { name: /hryvnia/i }).click();
    // The hidden file input is driven directly; setInputFiles works on hidden
    // inputs and triggers the same change handler a click+pick would.
    await page
      .getByTestId('import-statement-file-input')
      .setInputFiles([statement('2026-07-02,10,UAH,UA00'), statement('2026-07-03,20,UAH,UA00')]);
    await expect(page.getByText(/imported .*transactions?/i)).toBeVisible({ timeout: 15000 });
  });
});
