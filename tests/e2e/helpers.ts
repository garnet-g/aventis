import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { expect, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';

/** Reads .env.local (written from `supabase status`) so the test process can use the service role. */
function env() {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

export function service() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export const PASSWORD = 'e2e-password-123';
export const uniqueEmail = (tag: string) => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${tag}@example.com`;

export async function signUp(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.waitForURL('**/design');
}

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/design');
}

/** A signed-in admin in their own browser context. */
export async function adminPage(browser: Browser) {
  const email = uniqueEmail('admin');
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100', viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  await signUp(page, email);
  const db = service();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const id = users.users.find((u) => u.email === email)!.id;
  await db.from('profiles').update({ is_admin: true }).eq('id', id);
  return { page, context, email };
}

export async function userId(email: string) {
  const { data } = await service().auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)!.id;
}

export async function designIdFor(email: string) {
  const { data } = await service().from('designs').select('id').eq('user_id', await userId(email)).order('created_at', { ascending: false }).limit(1);
  return data![0].id as string;
}

export async function bigPng() {
  return sharp({ create: { width: 1800, height: 1800, channels: 3, background: '#c33' } }).png().toBuffer();
}

export async function addUpload(page: Page) {
  // The control is disabled until the page is interactive; a real customer cannot use it before that either.
  await expect(page.getByTestId('upload-input')).toBeEnabled();
  await page.getByTestId('upload-input').setInputFiles({ name: 'art.png', mimeType: 'image/png', buffer: await bigPng() });
  // No arbitrary wait: a customer can press Continue right away, and the app must cope with the upload in flight.
}

export async function addName(page: Page, name: string) {
  await expect(page.getByTestId('text-input')).toBeEnabled();
  await page.getByTestId('text-input').fill(name);
  await page.getByRole('button', { name: 'Add name' }).click();
  await page.waitForTimeout(500);
}

export async function fillDeliveryAndPay(page: Page) {
  await page.getByPlaceholder('Full name').fill('Ali Khan');
  await page.getByPlaceholder(/Mobile/).fill('03001234567');
  await page.getByPlaceholder('City').fill('Lahore');
  await page.locator('select[name=province]').selectOption('Punjab');
  await page.getByPlaceholder('Full address').fill('House 1, Street 2, Gulberg');
  await page.getByRole('button', { name: /^Pay PKR/ }).click();
}

/** From the cart (where an approved design lands) to the checkout page. */
export async function goToCheckout(page: Page) {
  await page.waitForURL('**/cart');
  await page.getByRole('link', { name: /^Checkout/ }).click();
  await page.waitForURL('**/checkout');
}
