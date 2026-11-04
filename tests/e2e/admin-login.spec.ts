import { expect, test } from '@playwright/test';
import { adminPage, uniqueEmail } from './helpers';

test('signing in as an admin opens the admin area; a customer goes to the designer and cannot open /admin', async ({ browser, page }) => {
  const admin = await adminPage(browser);
  try {
    // a fresh browser signs in with the admin's password
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill(admin.email);
    await page.getByPlaceholder(/password/i).fill('e2e-password-123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/admin/orders');
    await expect(page.getByTestId('count-new orders')).toBeVisible();
    // the shop's header shows an Admin link to admins
    await page.goto('/catalogue');
    await expect(page.getByTestId('admin-link')).toBeVisible();
    await page.goto('/admin');
    await page.waitForURL('**/admin/orders');
  } finally {
    await admin.context.close();
  }

  const customer = await browser.newContext({ baseURL: page.url().split('/admin')[0] });
  const cp = await customer.newPage();
  await cp.goto('/login');
  await cp.getByRole('button', { name: /create an account/i }).click();
  const email = uniqueEmail('plain');
  await cp.getByPlaceholder('Email').fill(email);
  await cp.getByPlaceholder(/password/i).fill('e2e-password-123');
  await cp.getByRole('button', { name: 'Sign up' }).click();
  await cp.waitForURL('**/design');
  await cp.goto('/catalogue');
  await expect(cp.getByRole('heading', { name: 'The catalogue' })).toBeVisible();
  await expect(cp.getByTestId('admin-link')).toHaveCount(0);
  await cp.goto('/admin/orders');
  await expect(cp.getByText(/could not be found|404/i).first()).toBeVisible();
  await customer.close();
});
