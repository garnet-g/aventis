import { beforeEach, describe, expect, test } from 'vitest';
import { BACK_PRINT_PRICE_KES, catalog, DELIVERY_FEE_KES } from '@/lib/catalog';
import { addToCart, cartFingerprint, loadCart, parseQuantity, removeFromCart, setCartQuantity } from '@/lib/cart';
import type { DesignLayer } from '@/lib/designLayers';
import { saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import { MemoryCartStore } from './helpers/memoryCart';
import { MemoryDesignStore } from './helpers/memoryStore';

const text = (t: string): DesignLayer => ({
  kind: 'text', text: t, font: 'sans', fill: '#111111', direction: 'ltr', fontSize: 0.12,
  rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }, rotation: 0,
});

let designs: MemoryDesignStore;
let cart: MemoryCartStore;
const deps = () => ({ designs, cart });

beforeEach(() => {
  designs = new MemoryDesignStore();
  cart = new MemoryCartStore();
});

async function design(owner: string, content = 'Ali', opts: { back?: string; product?: 'tee' | 'hoodie' } = {}) {
  const d = await saveDesign(designs, owner, {
    product: opts.product ?? 'tee',
    color: 'white',
    size: 'M',
    layers: [text(content)],
    backLayers: opts.back ? [text(opts.back)] : [],
  });
  await submitDesign(designs, new StubImageSafetyProvider(0), d.id, owner);
  return (await designs.get(d.id))!;
}

describe('addToCart', () => {
  test('puts an approved design in the cart with quantity 1', async () => {
    const d = await design('alice');
    await addToCart(deps(), 'alice', d.id);
    expect(await cart.list('alice')).toEqual([{ designId: d.id, quantity: 1 }]);
  });

  test('adding the same design again keeps its quantity, so a double click is harmless', async () => {
    const d = await design('alice');
    await addToCart(deps(), 'alice', d.id);
    await setCartQuantity(deps(), 'alice', d.id, 3);
    await addToCart(deps(), 'alice', d.id);
    expect(await cart.list('alice')).toEqual([{ designId: d.id, quantity: 3 }]);
  });

  test('refuses a design that is waiting for review, a draft, or rejected (403)', async () => {
    const waiting = await design('alice', 'Dick');
    expect(waiting.status).toBe('pending_review');
    await expect(addToCart(deps(), 'alice', waiting.id)).rejects.toMatchObject({ status: 403 });

    const rejected = await design('alice', 'fuck');
    await expect(addToCart(deps(), 'alice', rejected.id)).rejects.toMatchObject({ status: 403 });

    const draft = await saveDesign(designs, 'alice', { product: 'tee', color: 'white', size: 'M', layers: [text('x')] });
    await expect(addToCart(deps(), 'alice', draft.id)).rejects.toMatchObject({ status: 403 });
    expect(await cart.list('alice')).toEqual([]);
  });

  test('refuses a design whose layers changed after it was approved (403)', async () => {
    const d = await design('alice');
    await designs.update(d.id, { layers: [text('Something else')] }); // status stays approved, as after a bad write
    await expect(addToCart(deps(), 'alice', d.id)).rejects.toMatchObject({ status: 403 });
  });

  test("refuses someone else's design (404)", async () => {
    const d = await design('alice');
    await expect(addToCart(deps(), 'bob', d.id)).rejects.toMatchObject({ status: 404 });
  });

  test('refuses a design that has already been ordered (409)', async () => {
    const d = await design('alice');
    designs.ordered.add(d.id);
    await expect(addToCart(deps(), 'alice', d.id)).rejects.toMatchObject({ status: 409 });
  });

  test('an unknown design id is a 404', async () => {
    await expect(addToCart(deps(), 'alice', 'does-not-exist')).rejects.toMatchObject({ status: 404 });
  });
});

describe('quantity', () => {
  test('parseQuantity accepts whole numbers from 1 to 50', () => {
    for (const q of [1, 2, 25, 50]) expect(parseQuantity(q)).toBe(q);
  });

  test('parseQuantity rejects zero, negatives, fractions, too many, and non-numbers (400)', () => {
    for (const bad of [0, -1, 1.5, 51, 1000, NaN, Infinity, '3', null, undefined, {}]) {
      expect(() => parseQuantity(bad), String(bad)).toThrowError(expect.objectContaining({ status: 400 }));
    }
  });

  test('setCartQuantity changes the quantity of an item in the cart', async () => {
    const d = await design('alice');
    await addToCart(deps(), 'alice', d.id);
    await setCartQuantity(deps(), 'alice', d.id, 12);
    expect((await cart.list('alice'))[0].quantity).toBe(12);
  });

  test('setCartQuantity refuses an invalid quantity, and an item that is not in the cart', async () => {
    const d = await design('alice');
    await addToCart(deps(), 'alice', d.id);
    await expect(setCartQuantity(deps(), 'alice', d.id, 0)).rejects.toMatchObject({ status: 400 });
    await expect(setCartQuantity(deps(), 'alice', 'not-in-cart', 2)).rejects.toMatchObject({ status: 404 });
    expect((await cart.list('alice'))[0].quantity).toBe(1);
  });
});

describe('removing', () => {
  test('removeFromCart removes just that item', async () => {
    const a = await design('alice', 'A');
    const b = await design('alice', 'B');
    await addToCart(deps(), 'alice', a.id);
    await addToCart(deps(), 'alice', b.id);
    await removeFromCart(deps(), 'alice', a.id);
    expect((await cart.list('alice')).map((i) => i.designId)).toEqual([b.id]);
  });
});

describe('loadCart', () => {
  test('prices every line by quantity, with the back extra, and the delivery fee once', async () => {
    const a = await design('alice', 'A');
    const b = await design('alice', 'B', { back: 'Back', product: 'hoodie' });
    await addToCart(deps(), 'alice', a.id);
    await addToCart(deps(), 'alice', b.id);
    await setCartQuantity(deps(), 'alice', a.id, 3);
    await setCartQuantity(deps(), 'alice', b.id, 2);
    const view = await loadCart(deps(), 'alice');
    expect(view.lines.map((l) => l.priceKes)).toEqual([3 * catalog.tee.priceKes, 2 * (catalog.hoodie.priceKes + BACK_PRINT_PRICE_KES)]);
    expect(view.subtotalKes).toBe(3 * catalog.tee.priceKes + 2 * (catalog.hoodie.priceKes + BACK_PRINT_PRICE_KES));
    expect(view.deliveryFeeKes).toBe(DELIVERY_FEE_KES);
    expect(view.totalKes).toBe(view.subtotalKes + DELIVERY_FEE_KES);
    expect(view.canCheckout).toBe(true);
  });

  test('an item whose design changed since it was approved is flagged and blocks checkout', async () => {
    const a = await design('alice', 'A');
    const b = await design('alice', 'B');
    await addToCart(deps(), 'alice', a.id);
    await addToCart(deps(), 'alice', b.id);
    await saveDesign(designs, 'alice', { product: 'tee', color: 'white', size: 'M', layers: [text('B edited')] }, b.id); // back to draft
    const view = await loadCart(deps(), 'alice');
    expect(view.lines.find((l) => l.designId === b.id)).toMatchObject({ ok: false });
    expect(view.lines.find((l) => l.designId === b.id)?.problem).toMatch(/checked again/i);
    expect(view.lines.find((l) => l.designId === a.id)?.ok).toBe(true);
    expect(view.canCheckout).toBe(false);
  });

  test('an empty cart cannot be checked out and costs nothing', async () => {
    expect(await loadCart(deps(), 'alice')).toMatchObject({ lines: [], subtotalKes: 0, deliveryFeeKes: 0, totalKes: 0, canCheckout: false });
  });

  test('shows only the signed-in customer’s own cart', async () => {
    const a = await design('alice');
    await addToCart(deps(), 'alice', a.id);
    expect((await loadCart(deps(), 'bob')).lines).toEqual([]);
  });

  test('a design that no longer exists is left out instead of crashing the page', async () => {
    await cart.add('alice', 'ghost', 1);
    expect((await loadCart(deps(), 'alice')).lines).toEqual([]);
  });
});

describe('cartFingerprint', () => {
  const a = { designId: 'a', quantity: 1 };
  const b = { designId: 'b', quantity: 2 };

  test('is the same for the same items in any order, and 32 hex characters', () => {
    expect(cartFingerprint([a, b])).toBe(cartFingerprint([b, a]));
    expect(cartFingerprint([a, b])).toMatch(/^[0-9a-f]{32}$/);
  });

  test('changes when a quantity or an item changes', () => {
    expect(cartFingerprint([a, b])).not.toBe(cartFingerprint([a, { ...b, quantity: 3 }]));
    expect(cartFingerprint([a])).not.toBe(cartFingerprint([a, b]));
  });
});
