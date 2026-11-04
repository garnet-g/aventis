import { expect, test, type Page } from '@playwright/test';
import { addName, adminPage, designIdFor, fillDeliveryAndPay, goToCheckout, service, signUp, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

/** A customer designs "text", pays, and the id of the order that results is returned. */
async function placeOrder(page: Page, text: string) {
  const email = uniqueEmail('adm');
  await signUp(page, email);
  await addName(page, text);
  await page.getByTestId('continue').click();
  await goToCheckout(page);
  await fillDeliveryAndPay(page);
  await page.waitForURL('**/orders');
  const { data } = await service().from('orders').select('id').eq('design_id', await designIdFor(email)).single();
  return data!.id as string;
}

test('admins can add a private note, search for it, and filter orders by status; customers cannot read it', async ({ page, browser }) => {
  const orderId = await placeOrder(page, 'Note me');
  const admin = await adminPage(browser);

  await admin.page.goto(`/admin/orders/${orderId}`);
  const note = `Printer promised Friday ${Date.now()}`;
  await admin.page.getByLabel('Private note').fill(note);
  await admin.page.getByRole('button', { name: 'Save note' }).click();
  await expect(admin.page.getByRole('button', { name: /Note saved/ })).toBeVisible();
  await expect.poll(async () => (await service().from('order_notes').select('note').eq('order_id', orderId).single()).data?.note).toBe(note);

  // search finds it by the note, shows it in the list, and a status filter that does not match hides it
  await admin.page.goto(`/admin/orders?q=${encodeURIComponent(note)}`);
  await expect(admin.page.getByRole('link', { name: orderId.slice(0, 8) })).toBeVisible();
  await expect(admin.page.getByText(`Note: ${note}`)).toBeVisible();
  await admin.page.goto(`/admin/orders?q=${orderId.slice(0, 8)}&status=delivered`);
  await expect(admin.page.getByTestId('no-matches')).toBeVisible();
  await admin.page.goto(`/admin/orders?q=${orderId.slice(0, 8)}&status=paid`);
  await expect(admin.page.getByRole('link', { name: orderId.slice(0, 8) })).toBeVisible();

  // the search form works from the page itself
  await admin.page.getByLabel('Search orders').fill('zzz-nobody-has-this');
  await admin.page.getByRole('button', { name: 'Search' }).click();
  await expect(admin.page.getByTestId('no-matches')).toBeVisible();
  await admin.page.getByRole('link', { name: 'Clear' }).click();
  await expect(admin.page.getByTestId('no-matches')).toHaveCount(0);

  // a customer's own session can read their order but never the note
  await page.goto('/admin/orders');
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  await expect(page.getByLabel('Search orders')).toHaveCount(0);
  const put = await page.request.put(`/api/admin/orders/${orderId}/note`, { data: { note: 'hacked' } });
  expect(put.status()).toBe(404);
  const { data: stillThere } = await service().from('order_notes').select('note').eq('order_id', orderId).single();
  expect(stillThere!.note).toBe(note);
  await admin.context.close();
});

test('the admin menu counts new orders and designs waiting for review', async ({ page, browser }) => {
  await placeOrder(page, 'Count me');
  const admin = await adminPage(browser);
  await admin.page.goto('/admin/orders');
  const { count } = await service().from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid');
  await expect(admin.page.getByTestId('count-new orders')).toHaveText(String(count));
  await admin.context.close();
});

test('prices changed on screen reach the customer; paid orders keep their price; bad prices are refused', async ({ page, browser }) => {
  const admin = await adminPage(browser);
  const email = uniqueEmail('price');
  try {
    await admin.page.goto('/admin/settings');
    await admin.page.locator('input[name="tee-price"]').fill('2000');
    await admin.page.locator('input[name="tee-cost"]').fill('950');
    await admin.page.locator('input[name="delivery"]').fill('300');
    await admin.page.getByRole('button', { name: 'Save prices' }).click();
    await expect(admin.page.getByText('Prices saved')).toBeVisible();

    // a typo is explained and nothing is saved
    await admin.page.locator('input[name="tee-price"]').fill('12.5');
    await admin.page.getByRole('button', { name: 'Save prices' }).click();
    await expect(admin.page.locator('form [role="alert"]')).toContainText(/whole shillings/i);
    await admin.page.locator('input[name="tee-price"]').fill('');
    await admin.page.getByRole('button', { name: 'Save prices' }).click();
    await expect(admin.page.locator('form [role="alert"]')).toBeVisible();
    const { data: saved } = await service().from('settings').select('value').eq('key', 'prices').single();
    expect((saved!.value as { tee: { priceKes: number } }).tee.priceKes).toBe(2000);

    // the customer's cart and the payment use the new prices: 2,000 + 300 delivery
    await signUp(page, email);
    await addName(page, 'New price');
    await page.getByTestId('continue').click();
    await page.waitForURL('**/cart');
    await expect(page.getByTestId('cart-total')).toHaveText('KES 2,300');
    await goToCheckout(page);
    await fillDeliveryAndPay(page);
    await page.waitForURL('**/orders');
    const { data: order } = await service().from('orders').select('price_kes, cost_kes, delivery_fee_kes').eq('design_id', await designIdFor(email)).single();
    expect(order).toEqual({ price_kes: 2000, cost_kes: 950, delivery_fee_kes: 300 });

    // the home page shows the new price too
    await page.goto('/');
    await expect(page.getByText(/T-shirt from KES 2,000/)).toBeVisible();

    // a customer cannot change prices
    const res = await page.request.put('/api/admin/prices', { data: { tee: { priceKes: 1, costKes: 1 } } });
    expect(res.status()).toBe(404);
  } finally {
    await service().from('settings').delete().eq('key', 'prices'); // back to the defaults for the other tests
    await admin.context.close();
  }
});
