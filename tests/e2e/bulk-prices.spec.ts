import { expect, test } from '@playwright/test';
import { addName, adminPage, designIdFor, fillDeliveryAndPay, goToCheckout, service, signUp, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('bulk prices set by an admin lower the price of bigger orders, are shown to the customer, and are kept on the paid order', async ({ page, browser }) => {
  const admin = await adminPage(browser);
  const email = uniqueEmail('bulk');
  try {
    // the admin sees the starting bulk prices and replaces them with one: 2 or more save 20%
    await admin.page.goto('/admin/settings');
    await expect(admin.page.getByTestId('bulk-row')).toHaveCount(3);
    for (let i = 0; i < 3; i++) await admin.page.getByTestId('bulk-row').first().getByRole('button', { name: 'Remove' }).click();
    await admin.page.getByRole('button', { name: 'Add a bulk price' }).click();
    await admin.page.getByLabel('Bulk price 1 starts at').fill('2');
    await admin.page.getByLabel('Bulk price 1 percent off').fill('20');
    await admin.page.getByRole('button', { name: 'Save prices' }).click();
    await expect(admin.page.getByText('Prices saved')).toBeVisible();

    // a bad one is explained and nothing changes
    await admin.page.getByLabel('Bulk price 1 percent off').fill('95');
    await admin.page.getByRole('button', { name: 'Save prices' }).click();
    await expect(admin.page.locator('form [role="alert"]')).toContainText(/90%/);
    const { data: saved } = await service().from('settings').select('value').eq('key', 'prices').single();
    expect((saved!.value as { bulkTiers: unknown }).bulkTiers).toEqual([{ minQuantity: 2, percentOff: 20 }]);

    // the home page tells customers about it
    await page.goto('/');
    await expect(page.getByText(/2\+ save 20%/)).toBeVisible();

    // one piece is full price; two get the discount: 2 x 1,200 + 250 delivery
    await signUp(page, email);
    await addName(page, 'Team shirt');
    await page.getByTestId('continue').click();
    await page.waitForURL('**/cart');
    await expect(page.getByTestId('cart-total')).toHaveText('KES 1,750');
    await expect(page.getByTestId('bulk-badge')).toHaveCount(0);
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(page.getByTestId('bulk-badge')).toContainText('20% off');
    await expect(page.getByTestId('cart-total')).toHaveText('KES 2,650');

    await goToCheckout(page);
    await fillDeliveryAndPay(page);
    await page.waitForURL('**/orders');
    const { data: order } = await service().from('orders').select('quantity, price_kes, cost_kes, delivery_fee_kes').eq('design_id', await designIdFor(email)).single();
    expect(order).toEqual({ quantity: 2, price_kes: 2400, cost_kes: 1600, delivery_fee_kes: 250 });
  } finally {
    await service().from('settings').delete().eq('key', 'prices'); // back to the defaults for the other tests
    await admin.context.close();
  }
});
