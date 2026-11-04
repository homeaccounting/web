import { test, expect, type APIRequestContext } from '@playwright/test';
import { uniqueEmail } from './support/email';

// Regression for the reported UX bug: opening the "Map to contact…" picker from
// the (bottom-of-dialog) Import details section clipped the contact list. The
// ContactCombobox now flips the menu upward when there's no room below.
//
// Seeds a real imported PrivatBank transaction (unmapped token) via the API,
// then drives the browser as that user and asserts the dropdown is fully within
// the viewport. Requires the running banking-enabled backend (@local).
const API = 'http://localhost:8080';
const CARD = '4627 **** **** 9713';

// A synthetic PrivatBank statement for CARD whose "Prom.ua" row has no contact
// mapping. Dated today so it lands in the "This month" period the test views.
// The backend keys a row's idempotency on date + amount + balance, so both vary
// per run — a repeated row would be skipped as already imported.
function privatStatement(): Buffer {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const day = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const balance = (Math.random() * 100000).toFixed(2);
  return Buffer.from(
    [
      `Історія операцій за період ${day} - ${day},,,,,,,,,`,
      'Дата,Категорія,Картка,Опис операції,Сума в валюті картки,Валюта картки,Сума в валюті транзакції,Валюта транзакції,Залишок на кінець періоду,Валюта залишку',
      `${day} ${time},Інтернет-магазини,${CARD},Prom.ua,-450,UAH,450,UAH,${balance},UAH`,
    ].join('\n'),
  );
}

interface AuthResp {
  token: string;
  userId: string;
  email: string | null;
  expiresIn: number;
}
interface IdResp {
  id: string;
}

async function seed(request: APIRequestContext) {
  const email = uniqueEmail('dropdown');
  const reg = await request.post(`${API}/api/auth/register`, {
    data: { email, password: 'longenough123' },
  });
  const { token, userId, expiresIn } = (await reg.json()) as AuthResp;
  const auth = { Authorization: `Bearer ${token}` };

  const acc = (await (
    await request.post(`${API}/api/accounts`, {
      headers: auth,
      data: { name: 'Privat Card', initialBalance: 0, currency: 'UAH' },
    })
  ).json()) as IdResp;
  const conn = (await (
    await request.post(`${API}/api/users/me/configuration/banking/connections`, {
      headers: auth,
      data: { provider: 'privatbank', name: 'Privat', enabled: true },
    })
  ).json()) as IdResp;

  const csv = privatStatement();
  const multipart = {
    files: { name: 'tiny.csv', mimeType: 'text/csv', buffer: csv },
  };
  await request.post(
    `${API}/api/banking/connections/${conn.id}/external-accounts/from-file?format=csv`,
    { headers: auth, multipart },
  );
  await request.put(`${API}/api/users/me/configuration/banking/connections/${conn.id}/accounts`, {
    headers: auth,
    data: { accountMap: { [CARD]: acc.id } },
  });
  await request.post(`${API}/api/banking/connections/${conn.id}/import/file?format=csv`, {
    headers: auth,
    multipart,
  });

  return { token, userId, email, expiresIn, accountName: 'Privat Card' };
}

test.describe('edit-transaction map-to-contact dropdown @local', () => {
  test('contact list is not clipped when mapping from the edit dialog', async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);
    const s = await seed(request);

    // Inject the seeded session so the SPA is authenticated on first paint.
    const session = JSON.stringify({
      token: s.token,
      userId: s.userId,
      email: s.email,
      expiresAt: Date.now() + s.expiresIn * 1000,
    });
    await page.addInitScript((value: string) => {
      window.localStorage.setItem('ha.auth.v1', value);
    }, session);

    await page.goto('');
    // Open the seeded account's transactions.
    await page.getByRole('link', { name: new RegExp(s.accountName, 'i') }).click();
    // The default period is "Last month", which excludes today's seeded row.
    await page.getByRole('combobox', { name: /period/i }).click();
    await page.getByRole('option', { name: 'This month' }).click();

    // Open the edit dialog for the imported "Prom.ua" transaction.
    const row = page.getByRole('cell', { name: /Prom\.ua/ }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.dblclick();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The Import details section carries the creatable "Map to contact…" picker.
    const combobox = dialog.getByRole('combobox', { name: /map to contact/i });
    await expect(combobox).toBeVisible();
    await combobox.click();

    const listbox = dialog.getByRole('listbox');
    await expect(listbox).toBeVisible();

    // The whole list must sit within the viewport (not clipped at the bottom).
    const box = await listbox.boundingBox();
    const vh = page.viewportSize()!.height;
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vh + 1);
  });
});
