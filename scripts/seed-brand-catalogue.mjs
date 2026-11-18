// Posts and publishes the starter VibeCrew catalogue designs (the logo on T-shirts and hoodies: front, back, chest + back,
// front + back) by driving the real admin page, so the previews and checks are exactly what an admin would get.
// Needs the app running, the pictures from `node scripts/make-brand.mjs`, and an admin account:
//   ADMIN_EMAIL=admin@vibecrew.com ADMIN_PASSWORD=... node scripts/seed-brand-catalogue.mjs   (add REPLACE=1 to re-post)
// Designs whose title already exists are skipped, so it is safe to run twice.
import { chromium } from '@playwright/test';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD.');

const art = (name) => path.resolve('assets/brand', name);

// The logo is light art made for a black garment, so these are black only.
const ITEMS = [
  { product: 'tee', title: 'VibeCrew Mascot Tee: Front Print', description: 'The VibeCrew mascot, big across the front of a black T-shirt.', front: 'art-full.png' },
  { product: 'tee', title: 'VibeCrew Mascot Tee: Back Print', description: 'A clean front and the VibeCrew mascot across the back.', back: 'art-full.png' },
  { product: 'tee', title: 'VibeCrew Mascot Tee: Chest and Back', description: 'A small mascot on the chest and the full print across the back.', front: 'art-chest-tee.png', back: 'art-full.png' },
  { product: 'tee', title: 'VibeCrew Mascot Tee: Front and Back', description: 'The full VibeCrew mascot on both the front and the back.', front: 'art-full.png', back: 'art-full.png' },
  { product: 'hoodie', title: 'VibeCrew Mascot Hoodie: Front Print', description: 'The VibeCrew mascot, big across the front of a black hoodie.', front: 'art-full.png' },
  { product: 'hoodie', title: 'VibeCrew Mascot Hoodie: Back Print', description: 'A clean front and the VibeCrew mascot across the back.', back: 'art-full.png' },
  { product: 'hoodie', title: 'VibeCrew Mascot Hoodie: Chest and Back', description: 'A small mascot on the chest and the full print across the back.', front: 'art-chest-hoodie.png', back: 'art-full.png' },
  { product: 'hoodie', title: 'VibeCrew Mascot Hoodie: Front and Back', description: 'The full VibeCrew mascot on both the front and the back.', front: 'art-full.png', back: 'art-full.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ baseURL: BASE, viewport: { width: 1200, height: 900 } });
page.setDefaultTimeout(90_000);

await page.goto('/login');
await page.getByPlaceholder('Email').fill(EMAIL);
await page.getByPlaceholder(/password/i).fill(PASSWORD);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/admin/**');

// REPLACE=1 deletes a design with the same title first (e.g. after the print area or garment photos change), so it
// is posted again with fresh artwork placement and previews. Orders already placed keep their own copy.
const REPLACE = process.env.REPLACE === '1';
page.on('dialog', (d) => void d.accept()); // the admin page confirms deletes with a browser dialog

for (const item of ITEMS) {
  await page.goto('/admin/catalogue');
  const existing = page.getByTestId('admin-catalogue-item').filter({ hasText: item.title });
  if ((await existing.count()) > 0) {
    if (!REPLACE) {
      console.log('already there:', item.title);
      continue;
    }
    await existing.getByRole('button', { name: `Delete ${item.title}` }).click();
    await existing.waitFor({ state: 'detached' });
    console.log('deleted:', item.title);
  }
  const form = page.getByRole('form', { name: 'Post a design' });
  await form.getByLabel('Title').fill(item.title);
  await form.getByLabel(/Description/).fill(item.description);
  await form.getByLabel('Item').selectOption(item.product);
  await form.getByLabel('White').uncheck();
  if (item.front) await form.getByLabel('Front picture (PNG, JPG or WebP)').setInputFiles(art(item.front));
  if (item.back) await form.getByLabel('Back picture (optional)').setInputFiles(art(item.back));
  await form.getByRole('button', { name: 'Post design' }).click();
  await form.getByRole('status').waitFor();
  const card = page.getByTestId('admin-catalogue-item').filter({ hasText: item.title });
  await card.getByRole('button', { name: 'Publish' }).click();
  await card.getByText('Published').waitFor();
  console.log('posted and published:', item.title);
}
await browser.close();
