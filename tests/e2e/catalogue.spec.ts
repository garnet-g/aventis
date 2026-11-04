import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { adminPage, bigPng, fillDeliveryAndPay, goToCheckout, service, signUp, uniqueEmail, userId } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('an admin posts a design; it stays hidden until published; a customer orders it and the printer gets its art', async ({ page, browser }) => {
  const title = `Midnight Crew ${Date.now()}`;
  const admin = await adminPage(browser);
  try {
    // --- admin posts it ---
    await admin.page.goto('/admin/catalogue');
    const form = admin.page.getByRole('form', { name: 'Post a design' });
    await form.getByLabel('Title').fill(title);
    await form.getByLabel(/Description/).fill('Gold on black');
    await form.getByLabel('Front picture (PNG, JPG or WebP)').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: await bigPng() });
    await form.getByRole('button', { name: 'Post design' }).click();
    await expect(form.getByRole('status')).toContainText('Posted');
    const card = admin.page.getByTestId('admin-catalogue-item').filter({ hasText: title });
    await expect(card.getByText('Hidden')).toBeVisible();
    await expect(card.locator('img')).toBeVisible();

    // a bad submission is explained
    await form.getByLabel('Title').fill('No picture here');
    await form.getByRole('button', { name: 'Post design' }).click();
    await expect(form.getByRole('alert')).toContainText(/picture/i);

    // --- a customer cannot see it while hidden ---
    await page.goto('/catalogue');
    await expect(page.getByRole('heading', { name: 'The catalogue' })).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
    const { data: row } = await service().from('catalogue_items').select('id, published, mockups').eq('title', title).single();
    expect(row!.published).toBe(false);
    expect(Object.keys(row!.mockups as object).sort()).toEqual(['black-front', 'white-front']);
    await page.goto(`/catalogue/${row!.id}`);
    await expect(page.getByText(/could not be found/i)).toBeVisible();

    // --- admin publishes ---
    await card.getByRole('button', { name: 'Publish' }).click();
    await expect(card.getByText('Published')).toBeVisible();

    // --- customer finds it and orders 2 in black, size L ---
    await page.goto('/catalogue');
    await page.getByTestId('catalogue-card').filter({ hasText: title }).click();
    await page.waitForURL(/\/catalogue\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByTestId('catalogue-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Black' }).click();
    await page.getByRole('button', { name: 'L', exact: true }).click();
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForURL('**/login'); // signed out: asked to sign in first

    const email = uniqueEmail('shop');
    await page.getByRole('button', { name: /create an account/i }).click();
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder(/password/i).fill('e2e-password-123');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await page.waitForURL('**/design');

    await page.goto(`/catalogue/${row!.id}`);
    await page.getByRole('button', { name: 'Black' }).click();
    await page.getByRole('button', { name: 'L', exact: true }).click();
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForURL('**/cart');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line').getByTestId('quantity')).toHaveText('2');
    await expect(page.getByTestId('cart-total')).toHaveText('PKR 3,250'); // 2 x 1,500 + 250 delivery

    await goToCheckout(page);
    await fillDeliveryAndPay(page);
    await page.waitForURL('**/orders');

    const { data: order } = await service()
      .from('orders')
      .select('id, quantity, layers_snapshot, mockup_path, design_file_path, artifacts_failed, designs(color, size)')
      .eq('user_id', await userId(email))
      .single();
    expect(order).toMatchObject({ quantity: 2, artifacts_failed: false });
    expect(order!.designs).toEqual({ color: 'black', size: 'L' });
    expect(order!.mockup_path && order!.design_file_path).toBeTruthy();
    // the art was copied into the customer's own folder, and the original catalogue picture is still there
    const path = (order!.layers_snapshot as { uploadPath: string }[])[0].uploadPath;
    expect(path.startsWith(`${await userId(email)}/`)).toBe(true);
    const printed = await service().storage.from('artifacts').download(order!.design_file_path!);
    expect((await sharp(Buffer.from(await printed.data!.arrayBuffer())).metadata()).width).toBeGreaterThan(500);
    const { data: stillThere } = await service().from('catalogue_items').select('id').eq('id', row!.id).single();
    expect(stillThere).toBeTruthy();

    // --- "Customise" opens the design in the editor with the art already on it ---
    await page.goto(`/catalogue/${row!.id}`);
    await page.getByRole('button', { name: 'Customise this design' }).click();
    await page.waitForURL(/\/design\?d=/);
    await expect(page.getByRole('tab', { name: /Front/ })).toContainText('(1)');

    // --- hiding removes it from the shop again ---
    await card.getByRole('button', { name: 'Hide' }).click();
    await expect(card.getByText('Hidden')).toBeVisible();
    await page.goto('/catalogue');
    await expect(page.getByText(title)).toHaveCount(0);

    // --- customers cannot use the admin endpoints ---
    expect((await page.request.patch(`/api/admin/catalogue/${row!.id}`, { data: { published: true } })).status()).toBe(404);
    expect((await page.request.delete(`/api/admin/catalogue/${row!.id}`)).status()).toBe(404);
    const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#000' } }).png().toBuffer();
    const post = await page.request.post('/api/admin/catalogue', { multipart: { title: 'x', product: 'tee', colors: 'white', front: { name: 'a.png', mimeType: 'image/png', buffer: png } } });
    expect(post.status()).toBe(404);

    // --- deleting removes the design and its pictures; the paid order is unaffected ---
    admin.page.once('dialog', (d) => void d.accept());
    await card.getByRole('button', { name: `Delete ${title}` }).click();
    await expect(admin.page.getByText(title)).toHaveCount(0);
    expect((await service().from('catalogue_items').select('id').eq('id', row!.id)).data).toEqual([]);
    expect((await service().from('orders').select('id').eq('id', order!.id)).data).toHaveLength(1);
  } finally {
    await service().from('catalogue_items').delete().eq('title', title);
    await admin.context.close();
  }
});

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('pages use the whole width and the editor sits beside its controls', async ({ page }) => {
    for (const url of ['/', '/catalogue', '/login']) {
      await page.goto(url);
      const header = (await page.locator('header').first().boundingBox())!;
      expect(header.width, `${url} header`).toBeGreaterThanOrEqual(1430); // the black bar spans the screen
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
    await page.goto('/');
    const shell = (await page.locator('main .shell').first().boundingBox())!;
    expect(shell.width).toBeGreaterThan(1200); // content is wide, not a narrow column in the middle

    await signUp(page, uniqueEmail('wide'));
    await expect(page.getByTestId('upload-input')).toBeEnabled();
    const editor = (await page.getByTestId('editor-wrap').boundingBox())!;
    const controls = (await page.getByTestId('text-input').boundingBox())!;
    expect(controls.x).toBeGreaterThan(editor.x + editor.width); // controls are to the right, not below
    expect(editor.width).toBeGreaterThan(400);
  });
});

test('the brand is VybeCrew with a yellow tile logo', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/VybeCrew/);
  await expect(page.getByRole('link', { name: 'VybeCrew' }).first()).toBeVisible();
  const logo = await page.request.get('/brand/vybecrew-logo.svg');
  expect(logo.status()).toBe(200);
  expect(await logo.text()).toContain('#ffd60a');
  const icon = await page.request.get('/icon.svg');
  expect(icon.status()).toBe(200);
});
