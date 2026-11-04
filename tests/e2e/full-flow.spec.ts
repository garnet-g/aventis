import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { addName, addUpload, adminPage, designIdFor, fillDeliveryAndPay, goToCheckout, service, signUp, uniqueEmail, userId } from './helpers';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// These run against the real local Supabase stack (database, auth, storage) at a phone-sized viewport.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('customer designs, passes the check, pays in test mode; admin sees the paid order and downloads both files', async ({ page, browser }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  const email = uniqueEmail('cust');
  await signUp(page, email);
  await addUpload(page);
  await addName(page, 'Ali');
  await expectNoHorizontalScroll(page);
  expect(consoleErrors.filter((t) => /Cannot update a component/.test(t))).toEqual([]);
  await page.screenshot({ path: 'test-results/phone-design.png', fullPage: true });
  await page.getByTestId('continue').click();

  await goToCheckout(page);
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
  const blocked = await page.request.post('/api/cart', { data: { designId } });
  expect(blocked.status()).toBe(403); // a design that is waiting for review cannot go in the cart
  await page.goto('/checkout');
  await page.waitForURL('**/cart'); // an empty cart cannot be checked out

  const admin = await adminPage(browser);
  await admin.page.goto('/admin/review');
  await expect(admin.page.getByRole('button', { name: 'Approve' }).first()).toBeVisible();
  await admin.page.screenshot({ path: 'test-results/desktop-admin-review.png', fullPage: true });
  await admin.page.getByRole('button', { name: 'Approve' }).first().click();
  await expect.poll(async () => (await service().from('designs').select('status').eq('id', designId).single()).data!.status).toBe('approved');
  await admin.context.close();

  await page.goto('/orders');
  await page.getByRole('button', { name: 'Pay now' }).click(); // puts it in the cart
  await goToCheckout(page);
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
  const add = await page.request.post('/api/cart', { data: { designId } });
  expect(add.status()).toBe(403); // a rejected design cannot go in the cart
  const pay = await page.request.post('/api/pay', {
    data: { delivery: { name: 'Ali Khan', phone: '03001234567', city: 'Lahore', province: 'Punjab', address: 'House 1, Street 2' } },
  });
  expect(pay.status()).toBe(400); // and there is nothing to pay for

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
  for (const url of ['/api/pay', '/api/cart', '/api/designs', '/api/designs/00000000-0000-0000-0000-000000000000/submit', '/api/designs/00000000-0000-0000-0000-000000000000/upload']) {
    const res = await anon.post(url, { data: {}, maxRedirects: 0 });
    expect(res.status(), url).toBe(401);
  }
  await anon.dispose();
});

test('everyday images upload: small logo, WhatsApp-sized photo, WebP, and a sideways phone photo', async ({ page }) => {
  await signUp(page, uniqueEmail('imgs'));
  await expect(page.getByTestId('upload-input')).toBeEnabled();
  const solid = (w: number, h: number, c: string) => ({ create: { width: w, height: h, channels: 3 as const, background: c } });
  const files = [
    { name: 'logo.png', mimeType: 'image/png', buffer: await sharp(solid(800, 800, '#d33')).png().toBuffer() },
    { name: 'whatsapp.jpg', mimeType: 'image/jpeg', buffer: await sharp(solid(1280, 960, '#38c')).jpeg().toBuffer() },
    { name: 'sticker.webp', mimeType: 'image/webp', buffer: await sharp(solid(1000, 1000, '#c83')).webp().toBuffer() },
    { name: 'sideways.jpg', mimeType: 'image/jpeg', buffer: await sharp(solid(1600, 1200, '#3a7')).jpeg().withMetadata({ orientation: 6 }).toBuffer() },
  ];
  for (const file of files) {
    const done = page.waitForResponse((r) => r.url().includes('/upload'));
    await page.getByTestId('upload-input').setInputFiles(file);
    const res = await done;
    expect(res.status(), file.name).toBe(200);
    await expect(page.locator('p[role="alert"]')).toHaveCount(0); // the app's own messages (Next adds an invisible alert too)
    await expect(page.getByTestId('continue')).toBeEnabled(); // upload finished and the image is on the canvas
  }
  // a tiny image still gets a clear message
  const tiny = page.waitForResponse((r) => r.url().includes('/upload'));
  await page.getByTestId('upload-input').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: await sharp(solid(200, 200, '#000')).png().toBuffer() });
  expect((await tiny).status()).toBe(400);
  await expect(page.locator('p[role="alert"]')).toContainText(/300 pixels/);
});

test('a front-and-back design costs more, and the admin gets four files', async ({ page, browser }) => {
  const email = uniqueEmail('back');
  await signUp(page, email);
  await addName(page, 'Front');
  await page.getByRole('tab', { name: /Back/ }).click();
  await addName(page, 'Back');
  await page.getByTestId('continue').click();

  await goToCheckout(page);
  await expect(page.getByText(/front and back/i).first()).toBeVisible(); // the back print is part of the line's price
  await expect(page.getByRole('button', { name: /^Pay PKR 2,250/ })).toBeVisible(); // 1,500 + 500 + 250
  await fillDeliveryAndPay(page);
  await page.waitForURL('**/orders');

  const designId = await designIdFor(email);
  const { data: order } = await service()
    .from('orders')
    .select('id, price_pkr, cost_pkr, artifacts_failed, back_mockup_path, back_design_file_path, back_layers_snapshot')
    .eq('design_id', designId)
    .single();
  expect(order).toMatchObject({ price_pkr: 2000, cost_pkr: 1200, artifacts_failed: false });
  expect(order!.back_mockup_path).toBeTruthy();
  expect(order!.back_design_file_path).toBeTruthy();
  expect(order!.back_layers_snapshot).toHaveLength(1);

  const admin = await adminPage(browser);
  await admin.page.goto(`/admin/orders/${order!.id}`);
  for (const label of ['Download mockup', 'Download design file', 'Download back mockup', 'Download back design file']) {
    await expect(admin.page.getByRole('link', { name: label })).toBeVisible();
  }
  for (const file of ['back-mockup', 'back-design']) {
    const res = await admin.context.request.get(`/api/admin/orders/${order!.id}/download?file=${file}`);
    expect(res.status(), file).toBe(200);
    expect([...(await res.body()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }
  await admin.context.close();
});

test('a design is saved as you go, and can be resumed later with its image and text', async ({ page }) => {
  const email = uniqueEmail('resume');
  await signUp(page, email);
  await addUpload(page);
  await addName(page, 'Resume me');
  await expect(page.getByTestId('save-status')).toContainText('Saved');

  await page.goto('/orders');
  const resume = page.getByRole('link', { name: 'Continue designing' });
  await expect(resume).toBeVisible();
  await resume.click();
  await page.waitForURL('**/design?d=*');

  // what was saved comes back: two things on the front...
  await expect(page.getByRole('tab', { name: /Front/ })).toContainText('(2)');
  // ...and the picture is really drawn again (a red square from the signed link), not just counted
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const c = document.querySelector('canvas.lower-canvas') as HTMLCanvasElement;
        const s = c.width / 400;
        const d = c.getContext('2d')!.getImageData(Math.round(175 * s), Math.round(135 * s), 1, 1).data;
        return d[0] > 180 && d[1] < 90 && d[2] < 90;
      }),
    )
    .toBe(true);
});

test('Save for later keeps the design and goes to My prints', async ({ page }) => {
  await signUp(page, uniqueEmail('later'));
  await addName(page, 'Later');
  await page.getByRole('button', { name: 'Save for later' }).click();
  await page.waitForURL('**/orders');
  await expect(page.getByTestId('design-state').first()).toHaveText('Draft');
});

test('a cart holds several designs with quantities; one payment makes one order for each', async ({ page, browser }) => {
  const email = uniqueEmail('cart');
  await signUp(page, email);
  await addName(page, 'One');
  await page.getByTestId('continue').click();
  await page.waitForURL('**/cart');
  await expect(page.getByTestId('cart-line')).toHaveCount(1);

  await page.getByRole('link', { name: 'Add another design' }).click();
  await page.waitForURL('**/design');
  await addName(page, 'Two');
  await page.getByTestId('continue').click();
  await page.waitForURL('**/cart');
  await expect(page.getByTestId('cart-line')).toHaveCount(2);

  const first = page.getByTestId('cart-line').first();
  await first.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(first.getByTestId('quantity')).toHaveText('2');
  await first.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(first.getByTestId('quantity')).toHaveText('3');
  // 3 x 1,500 + 1 x 1,500 + 250 delivery, charged once
  await expect(page.getByTestId('cart-total')).toHaveText('PKR 6,250');

  await page.getByRole('link', { name: /^Checkout/ }).click();
  await page.waitForURL('**/checkout');
  await expect(page.getByRole('button', { name: /^Pay PKR 6,250/ })).toBeVisible();
  await fillDeliveryAndPay(page);
  await page.waitForURL('**/orders');

  const { data: orders } = await service()
    .from('orders')
    .select('id, quantity, price_pkr, delivery_fee_pkr, payment_ref, position, artifacts_failed')
    .eq('user_id', await userId(email))
    .order('position');
  expect(orders!.map((o) => o.quantity)).toEqual([3, 1]);
  expect(orders!.map((o) => o.price_pkr)).toEqual([4500, 1500]);
  expect(orders!.map((o) => o.delivery_fee_pkr)).toEqual([250, 0]);
  expect(new Set(orders!.map((o) => o.payment_ref)).size).toBe(1);
  expect(orders!.every((o) => !o.artifacts_failed)).toBe(true);

  await page.goto('/cart');
  await expect(page.getByText('Your cart is empty')).toBeVisible();

  const admin = await adminPage(browser);
  await admin.page.goto(`/admin/orders/${orders![0].id}`);
  await expect(admin.page.getByText('Quantity: 3')).toBeVisible(); // the number of pieces to print
  await admin.context.close();
});

test('items can be removed, and a quantity must be a whole number from 1 to 50', async ({ page }) => {
  const email = uniqueEmail('qty');
  await signUp(page, email);
  await addName(page, 'Limits');
  await page.getByTestId('continue').click();
  await page.waitForURL('**/cart');
  const designId = await designIdFor(email);

  for (const [quantity, expected] of [[0, 400], [51, 400], [1.5, 400], [50, 200]] as const) {
    const res = await page.request.put(`/api/cart/${designId}`, { data: { quantity } });
    expect(res.status(), String(quantity)).toBe(expected);
  }
  await page.reload();
  await expect(page.getByTestId('cart-line').getByTestId('quantity')).toHaveText('50');
  await expect(page.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('a design edited after it went in the cart must be checked again before it can be paid for', async ({ page }) => {
  const email = uniqueEmail('edit');
  await signUp(page, email);
  await addName(page, 'Edit me');
  await page.getByTestId('continue').click();
  await page.waitForURL('**/cart');
  const designId = await designIdFor(email);

  await page.goto(`/design?d=${designId}`);
  await expect(page.getByRole('tab', { name: /Front/ })).toContainText('(1)');
  await addName(page, 'More');
  // the page already says "Saved" for the loaded design, so wait for the edit itself to reach the database
  await expect
    .poll(async () => (await service().from('designs').select('layers').eq('id', designId).single()).data?.layers.length)
    .toBe(2);

  await page.goto('/cart');
  await expect(page.getByText(/checked again/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /^Checkout/ })).toHaveAttribute('aria-disabled', 'true');
});

test('a resumed design is drawn exactly once (no duplicate layers)', async ({ page }) => {
  const email = uniqueEmail('dup');
  await signUp(page, email);
  await addName(page, 'Only one');
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.goto(`/design?d=${await designIdFor(email)}`);
  await expect(page.getByRole('tab', { name: /Front/ })).toContainText('(1)');
  await addName(page, 'Second');
  await expect(page.getByRole('tab', { name: /Front/ })).toContainText('(2)');
  const id = await designIdFor(email);
  await expect.poll(async () => (await service().from('designs').select('layers').eq('id', id).single()).data?.layers.length).toBe(2);
  const { data } = await service().from('designs').select('layers').eq('id', await designIdFor(email)).single();
  expect((data!.layers as { text: string }[]).map((l) => l.text)).toEqual(['Only one', 'Second']);
});

test('a cropped picture with its background removed is stored, checked and can be paid for', async ({ page }) => {
  test.setTimeout(300_000);
  const email = uniqueEmail('crop');
  await signUp(page, email);
  await addUpload(page);
  const edited = page.getByRole('region', { name: 'Selected item' });
  await expect(edited).toBeVisible();

  await edited.getByRole('button', { name: 'Crop' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Crop', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('continue')).toBeEnabled(); // the edited picture finished uploading
  await expect(page.getByTestId('edit-status')).toHaveCount(0);

  await edited.getByRole('button', { name: 'Remove background' }).click();
  await expect(page.getByTestId('edit-status')).toBeVisible();
  await expect(page.getByTestId('edit-status')).toHaveCount(0, { timeout: 200_000 });
  await expect(page.getByTestId('continue')).toBeEnabled();

  await page.getByTestId('continue').click();
  await page.waitForURL('**/cart');
  const { data } = await service().from('designs').select('layers, status').eq('id', await designIdFor(email)).single();
  expect(data!.status).toBe('approved');
  const layers = data!.layers as { kind: string; uploadPath: string }[];
  expect(layers).toHaveLength(1);
  // the stored picture is the edited one: smaller than the 1800 px original and with a see-through background
  const { data: file } = await service().storage.from('uploads').download(layers[0].uploadPath);
  const meta = await sharp(Buffer.from(await file!.arrayBuffer())).metadata();
  expect(meta.hasAlpha).toBe(true);
  expect(meta.width).toBeLessThan(1800);
  await goToCheckout(page);
  await fillDeliveryAndPay(page);
  await page.waitForURL('**/orders');
});
