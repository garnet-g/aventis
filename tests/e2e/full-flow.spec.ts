import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { addName, addUpload, adminPage, designIdFor, fillDeliveryAndPay, service, signUp, uniqueEmail } from './helpers';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// These run against the real local Supabase stack (database, auth, storage) at a phone-sized viewport.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('customer designs, passes the check, pays in test mode; admin sees the paid order and downloads both files', async ({ page, browser }) => {
  const email = uniqueEmail('cust');
  await signUp(page, email);
  await addUpload(page);
  await addName(page, 'Ali');
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: 'test-results/phone-design.png', fullPage: true });
  await page.getByTestId('continue').click();

  await page.waitForURL('**/checkout/**');
  await expect(page.getByTestId('test-mode-banner')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: 'test-results/phone-checkout.png', fullPage: true });
  await fillDeliveryAndPay(page);
  await page.waitForURL('**/orders');
  await expect(page.getByTestId('design-state').first()).toHaveText('Paid');
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: 'test-results/phone-orders.png', fullPage: true });

  // admin
  const admin = await adminPage(browser);
  await admin.page.goto('/admin/orders');
  const designId = await designIdFor(email);
  const { data: order } = await service().from('orders').select('id, mockup_path, design_file_path, artifacts_failed, layers_snapshot').eq('design_id', designId).single();
  expect(order!.artifacts_failed).toBe(false);
  expect(order!.mockup_path).toBeTruthy();
  // the customer's uploaded image must be part of what was paid for (not lost while the upload was in flight)
  expect((order!.layers_snapshot as { kind: string }[]).map((l) => l.kind).sort()).toEqual(['image', 'text']);

  await admin.page.goto(`/admin/orders/${order!.id}`);
  await expect(admin.page.getByText('Status: Paid')).toBeVisible();
  await admin.page.screenshot({ path: 'test-results/desktop-admin-order.png', fullPage: true });
  for (const file of ['mockup', 'design']) {
    const res = await admin.context.request.get(`/api/admin/orders/${order!.id}/download?file=${file}`);
    expect(res.status()).toBe(200);
    const body = await res.body();
    expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // PNG signature
    writeFileSync(`test-results/order-${file}.png`, body); // kept for a visual check
    if (file === 'mockup') {
      // the red upload sits in the middle of the print area on the garment photo
      const { data, info } = await sharp(body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const i = (290 * info.width + 360) * info.channels;
      expect(data[i]).toBeGreaterThan(180); // red
      expect(data[i + 1]).toBeLessThan(90);
      expect(data[i + 2]).toBeLessThan(90);
    }
  }

  await admin.page.getByRole('button', { name: /Mark as: At printer/ }).click();
  await expect(admin.page.getByText('Status: At printer')).toBeVisible();
  await admin.context.close();
});

test('an unsure design shows Waiting for review, payment is blocked, then the admin approves and the customer pays', async ({ page, browser }) => {
  const email = uniqueEmail('cust');
  await signUp(page, email);
  await addName(page, 'Dick'); // a word that is also a name: goes to a person
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('design-outcome')).toContainText('Waiting for review');

  const designId = await designIdFor(email);
  await page.goto(`/checkout/${designId}`);
  await page.waitForURL('**/orders'); // checkout refuses a design that is not approved
  const blocked = await page.request.post('/api/pay', { data: { designId, delivery: {} } });
  expect([400, 403]).toContain(blocked.status());

  const admin = await adminPage(browser);
  await admin.page.goto('/admin/review');
  await expect(admin.page.getByRole('button', { name: 'Approve' }).first()).toBeVisible();
  await admin.page.screenshot({ path: 'test-results/desktop-admin-review.png', fullPage: true });
  await admin.page.getByRole('button', { name: 'Approve' }).first().click();
  await expect.poll(async () => (await service().from('designs').select('status').eq('id', designId).single()).data!.status).toBe('approved');
  await admin.context.close();

  await page.goto('/orders');
  await page.getByRole('link', { name: 'Pay now' }).click();
  await page.waitForURL('**/checkout/**');
  await fillDeliveryAndPay(page);
  await page.waitForURL('**/orders');
  await expect(page.getByTestId('design-state').first()).toHaveText('Paid');
});

test('an explicit design is rejected and cannot be paid; the customer can start over', async ({ page }) => {
  const email = uniqueEmail('cust');
  await signUp(page, email);
  await addName(page, 'fuck');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('design-outcome')).toContainText(/explicit/i);

  const designId = await designIdFor(email);
  const pay = await page.request.post('/api/pay', {
    data: { designId, delivery: { name: 'Ali Khan', phone: '03001234567', city: 'Lahore', province: 'Punjab', address: 'House 1, Street 2' } },
  });
  expect(pay.status()).toBe(403);

  await page.goto('/orders');
  await page.getByRole('link', { name: 'Start a new design' }).click();
  await page.waitForURL('**/design');
  await expect(page.getByTestId('continue')).toBeVisible();
});

test('customer uploads and generated files are not publicly readable', async () => {
  const db = service();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54421';
  for (const bucket of ['uploads', 'artifacts']) {
    const path = `e2e-private-check/${Date.now()}.txt`;
    const up = await db.storage.from(bucket).upload(path, Buffer.from('secret'), { contentType: 'text/plain' });
    expect(up.error).toBeNull();
    // the public-URL form of the link must not serve the file, with or without the anon key
    const anon = (await import('node:fs')).readFileSync('.env.local', 'utf8').match(/ANON_KEY=(.*)/)![1];
    for (const headers of [{} as Record<string, string>, { apikey: anon, authorization: `Bearer ${anon}` }]) {
      const res = await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`, { headers });
      expect(res.status, `${bucket} public URL`).not.toBe(200);
    }
    const authed = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } });
    expect(authed.status, `${bucket} anon read`).not.toBe(200);
    await db.storage.from(bucket).remove([path]);
  }
});

test('customer API calls without a session answer 401, not a redirect or a server error', async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100' });
  for (const url of ['/api/pay', '/api/designs', '/api/designs/00000000-0000-0000-0000-000000000000/submit', '/api/designs/00000000-0000-0000-0000-000000000000/upload']) {
    const res = await anon.post(url, { data: {}, maxRedirects: 0 });
    expect(res.status(), url).toBe(401);
  }
  await anon.dispose();
});
