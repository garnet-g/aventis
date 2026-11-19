import { expect, test } from '@playwright/test';
import { addName, addUpload, fillDeliveryAndPay, PASSWORD, service, signUp, uniqueEmail, userId } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('a visitor designs without an account and only signs up to pay; the cart comes along', async ({ page }) => {
  await page.goto('/design');
  await expect(page).toHaveURL(/\/design$/); // no detour to the sign-in page
  await addName(page, 'Guest crew');
  await expect(page.getByTestId('save-status')).toHaveText('Saved ✓', { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible(); // a guest is offered sign-in, not "Account"
  await page.getByTestId('continue').click();
  await page.waitForURL('**/cart');
  await expect(page.getByTestId('cart-line')).toHaveCount(1);

  // paying needs an account: checkout asks for one, starting on "create account"
  await page.getByRole('link', { name: /^Checkout/ }).click();
  await page.waitForURL(/\/login\?next=%2Fcheckout/);
  await expect(page.getByTestId('account-reason')).toContainText('Your designs and cart come with you');
  const email = uniqueEmail('guest');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.waitForURL('**/checkout');
  await expect(page.getByRole('button', { name: /^Pay KES 1,750/ })).toBeVisible();

  // the design now belongs to the new account, and it can be paid for
  const id = await userId(email);
  const { data: designs } = await service().from('designs').select('id').eq('user_id', id);
  expect(designs).toHaveLength(1);
  await fillDeliveryAndPay(page);
  const { data: orders } = await service().from('orders').select('id').eq('user_id', id);
  expect(orders).toHaveLength(1);
});

test("a guest who signs in to an existing account brings their designs and pictures; guests can't pay", async ({ page, browser }) => {
  // an existing customer, in another browser
  const email = uniqueEmail('existing');
  const other = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100' });
  await signUp(await other.newPage(), email);
  await other.close();

  await page.goto('/design');
  await addUpload(page);
  await expect(page.getByTestId('save-status')).toHaveText('Saved ✓', { timeout: 15_000 });
  expect((await page.request.post('/api/pay', { data: { delivery: {}, acceptTerms: true } })).status()).toBe(403);

  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.waitForURL('**/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/design');

  const id = await userId(email);
  await expect.poll(async () => (await service().from('designs').select('id').eq('user_id', id)).data?.length).toBe(1);
  const { data: d } = await service().from('designs').select('id, layers').eq('user_id', id).single();
  const path = (d!.layers as { uploadPath: string }[])[0].uploadPath;
  expect(path.startsWith(`${id}/${d!.id}/`)).toBe(true); // the picture moved to the account's folder
  const { data: file } = await service().storage.from('uploads').download(path);
  expect(file).not.toBeNull();
  // and it opens in the editor from My prints
  await page.goto('/orders');
  await page.getByRole('link', { name: 'Continue designing' }).click();
  await page.waitForURL(/\/design\?d=/);
  await expect(page.getByTestId('editor-wrap')).toBeVisible();
});

test('a visitor can add a catalogue design to the cart without signing up', async ({ page }) => {
  await page.goto('/catalogue');
  await page.locator('a[href^="/catalogue/"]').first().click();
  await page.waitForURL(/\/catalogue\/[0-9a-f-]{36}/);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.waitForURL('**/cart');
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
});
