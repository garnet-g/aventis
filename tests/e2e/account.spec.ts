import { expect, test, type Page } from '@playwright/test';
import { adminPage, PASSWORD, signUp, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

// The local Supabase stack catches every email in Mailpit instead of sending it.
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54424';

async function latestEmailLink(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string; HTML: string };
      const link = (msg.Text + msg.HTML).match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/)?.[0];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email with a link arrived for ${to}`);
}

const header = (page: Page) => page.locator('header').first();

test('a customer can sign out, reset a forgotten password, and sign in with the new one', async ({ page }) => {
  const email = uniqueEmail('reset');
  await signUp(page, email);

  // signed in: the header offers Sign out; signing out returns home with Sign in offered again
  await expect(header(page).getByRole('button', { name: 'Sign out' })).toBeVisible();
  await header(page).getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await expect(header(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto('/cart');
  await page.waitForURL('**/login?next=%2Fcart');

  // a wrong password gets a plain message with the way out
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/password/i).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form [role="alert"]')).toContainText(/don't match/i);

  // forgot password: the same answer whether or not the email has an account
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(/link to set a new password is on its way/i);

  // the emailed link signs them in and asks for a new password
  await page.goto(await latestEmailLink(email));
  await page.waitForURL('**/reset-password');
  const newPassword = `${PASSWORD}-new`;
  await page.getByLabel('New password').fill(newPassword);
  await page.getByLabel('Type it again').fill(`${newPassword}x`);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('form [role="alert"]')).toContainText(/different/i);
  await page.getByLabel('Type it again').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.waitForURL('**/design');

  // the new password works, and sign-in returns to the page they wanted
  await header(page).getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.goto('/login?next=%2Forders');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/password/i).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/orders');
});

test('signing up with an email that is taken explains what to do', async ({ page }) => {
  const email = uniqueEmail('taken');
  await signUp(page, email);
  await header(page).getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.goto('/login');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.locator('form [role="alert"]')).toContainText(/already an account/i);
});

test('a used or broken reset link is explained instead of failing silently', async ({ page }) => {
  await page.goto('/auth/callback?code=not-a-real-code&next=%2Freset-password');
  await page.waitForURL('**/login?mode=reset&error=link');
  await expect(page.getByRole('alert')).toContainText(/expired or was already used/i);
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  // and the callback never sends anyone to another site
  await page.goto('/auth/callback?code=x&next=https%3A%2F%2Fevil.example');
  expect(new URL(page.url()).pathname).toBe('/login');
  expect(new URL(page.url()).host).not.toContain('evil.example');
});

test('wrong links get the VybeCrew 404 page; non-admins never see the admin menu', async ({ page, browser }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page could not be found.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Shop the catalogue' })).toBeVisible();

  await signUp(page, uniqueEmail('nosy'));
  await page.goto('/admin/orders');
  await expect(page.getByText(/could not be found/i).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);

  // an admin sees the admin menu with View shop and Sign out
  const admin = await adminPage(browser);
  try {
    await admin.page.goto('/admin/orders');
    const nav = admin.page.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link', { name: 'View shop' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Sign out' })).toBeVisible();
  } finally {
    await admin.context.close();
  }
});
