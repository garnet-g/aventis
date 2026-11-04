import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { printAreaFor } from '@/lib/catalog';
import { centeredImageLayer, createCatalogueItem, orderFromCatalogue, previewKey, type ArtFile, type CatalogueItem, type CatalogueStore } from '@/lib/catalogueItems';
import { layersHash } from '@/lib/designs';
import { placeCheckout } from '@/lib/orders';
import { DummyProvider } from '@/lib/payments/dummy';
import { addUser, asUser, newDb } from './helpers/db';
import { MemoryCartStore } from './helpers/memoryCart';
import { MemoryDesignStore } from './helpers/memoryStore';
import { pgOrderStore } from './helpers/pgOrderStore';

class MemoryCatalogue implements CatalogueStore {
  items = new Map<string, CatalogueItem>();
  async list(opts?: { publishedOnly?: boolean }) {
    return [...this.items.values()].filter((i) => !opts?.publishedOnly || i.published);
  }
  async get(id: string) {
    return this.items.get(id) ?? null;
  }
  async insert(item: Omit<CatalogueItem, 'createdAt'>) {
    const full = { ...item, createdAt: new Date().toISOString() };
    this.items.set(item.id, full);
    return full;
  }
  async update(id: string, patch: Partial<Pick<CatalogueItem, 'published' | 'mockups'>>) {
    const cur = this.items.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.items.set(id, next);
    return next;
  }
  async remove(id: string) {
    this.items.delete(id);
  }
}

const art = (widthPx: number, heightPx: number, ext: 'png' | 'jpg' = 'png'): ArtFile => ({
  buffer: Buffer.from('x'),
  ext,
  mime: ext === 'png' ? 'image/png' : 'image/jpeg',
  widthPx,
  heightPx,
});
const fields = { title: 'Midnight Crew', description: 'Gold on black', product: 'tee', colors: ['white', 'black'] };

describe('centeredImageLayer', () => {
  test('is centred, inside the print area and keeps the picture shape', () => {
    const area = printAreaFor('tee', 'front');
    for (const [w, h] of [[1000, 1000], [2000, 500], [500, 2000]]) {
      const l = centeredImageLayer({ product: 'tee', side: 'front', uploadPath: 'a.png', widthPx: w, heightPx: h });
      if (l.kind !== 'image') throw new Error('expected an image');
      expect(l.rect.x).toBeGreaterThanOrEqual(0);
      expect(l.rect.y).toBeGreaterThanOrEqual(0);
      expect(l.rect.x + l.rect.width).toBeLessThanOrEqual(1);
      expect(l.rect.y + l.rect.height).toBeLessThanOrEqual(1);
      expect(l.rect.x + l.rect.width / 2).toBeCloseTo(0.5, 6);
      expect(l.rect.y + l.rect.height / 2).toBeCloseTo(0.5, 6);
      // printed size in cm has the same shape as the picture
      expect((l.rect.width * area.widthCm) / (l.rect.height * area.heightCm)).toBeCloseTo(w / h, 4);
      // and it fills 90% of the limiting side
      expect(Math.max(l.rect.width, l.rect.height)).toBeCloseTo(0.9, 6);
    }
  });
});

describe('posting a design', () => {
  const deps = () => {
    const store = new MemoryCatalogue();
    const saved: string[] = [];
    const previews: string[] = [];
    return {
      store,
      saved,
      previews,
      d: {
        store,
        saveArt: async (path: string) => void saved.push(path),
        renderPreview: async (a: { color: string; side: string }) => {
          previews.push(`${a.color}-${a.side}`);
          return { path: `previews/${a.color}-${a.side}.png` };
        },
      },
    };
  };

  test('saves the pictures, makes a preview for each colour and side, and starts hidden', async () => {
    const { d, store, saved, previews } = deps();
    const item = await createCatalogueItem(d, { fields, front: art(1000, 800), back: art(600, 600, 'jpg') });
    expect(item.published).toBe(false);
    expect(item.layers).toHaveLength(1);
    expect(item.backLayers).toHaveLength(1);
    expect(saved).toHaveLength(2);
    expect(saved.every((p) => p.startsWith(`art/${item.id}/`))).toBe(true);
    expect(saved.some((p) => p.endsWith('.jpg'))).toBe(true);
    expect(previews.sort()).toEqual(['black-back', 'black-front', 'white-back', 'white-front']);
    expect(Object.keys(item.mockups).sort()).toEqual(['black-back', 'black-front', 'white-back', 'white-front']);
    expect((await store.get(item.id))?.title).toBe('Midnight Crew');
  });

  test('a design with only a back picture previews the back', async () => {
    const { d } = deps();
    const item = await createCatalogueItem(d, { fields: { ...fields, colors: ['black'] }, back: art(900, 900) });
    expect(item.layers).toHaveLength(0);
    expect(Object.keys(item.mockups)).toEqual(['black-back']);
    expect(previewKey(item, 'black')).toBe('black-back');
  });

  test('a preview that cannot be rendered does not stop the design from posting', async () => {
    const { d } = deps();
    const item = await createCatalogueItem({ ...d, renderPreview: async () => null }, { fields, front: art(900, 900) });
    expect(item.mockups).toEqual({});
    expect(previewKey(item, 'white')).toBeNull();
  });

  test.each([
    ['no picture', { fields }],
    ['a short title', { fields: { ...fields, title: 'x' }, front: art(900, 900) }],
    ['an unknown item', { fields: { ...fields, product: 'cap' }, front: art(900, 900) }],
    ['no colour', { fields: { ...fields, colors: [] }, front: art(900, 900) }],
    ['an unknown colour', { fields: { ...fields, colors: ['pink'] }, front: art(900, 900) }],
    ['a long description', { fields: { ...fields, description: 'x'.repeat(501) }, front: art(900, 900) }],
  ])('refuses %s with 400 and stores nothing', async (_name, input) => {
    const { d, store, saved } = deps();
    await expect(createCatalogueItem(d, input as Parameters<typeof createCatalogueItem>[1])).rejects.toMatchObject({ status: 400 });
    expect(store.items.size).toBe(0);
    expect(saved).toHaveLength(0);
  });
});

describe('ordering a catalogue design', () => {
  let items: MemoryCatalogue;
  let designs: MemoryDesignStore;
  let cart: MemoryCartStore;
  let copies: { from: string; to: string }[];
  let itemId: string;
  const userId = '00000000-0000-4000-8000-000000000001';
  const run = (input: Parameters<typeof orderFromCatalogue>[3], id = itemId, who = userId) =>
    orderFromCatalogue({ items, designs, cart, copyArt: async (from, to) => void copies.push({ from, to }) }, who, id, input);

  beforeEach(async () => {
    items = new MemoryCatalogue();
    designs = new MemoryDesignStore();
    cart = new MemoryCartStore();
    copies = [];
    const made = await createCatalogueItem(
      { store: items, saveArt: async () => undefined, renderPreview: async () => null },
      { fields: { ...fields, colors: ['black'] }, front: art(1000, 1000), back: art(500, 500, 'jpg') },
    );
    itemId = made.id;
    await items.update(itemId, { published: true });
  });

  test('puts an approved copy in the cart, with the pictures copied into the customer’s own folder', async () => {
    const { design, inCart } = await run({ color: 'black', size: 'L', quantity: 3 });
    expect(inCart).toBe(true);
    expect(design).toMatchObject({ userId, product: 'tee', color: 'black', size: 'L', status: 'approved' });
    expect(design.moderatedHash).toBe(layersHash(design.layers, design.backLayers));
    expect(await cart.list(userId)).toEqual([{ designId: design.id, quantity: 3 }]);
    expect(copies).toHaveLength(2);
    for (const l of [...design.layers, ...design.backLayers]) {
      if (l.kind !== 'image') throw new Error('expected images');
      expect(l.uploadPath.startsWith(`${userId}/${design.id}/`)).toBe(true);
      expect(l.uploadPath).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg)$/);
    }
    expect(design.backLayers[0].kind === 'image' && design.backLayers[0].uploadPath.endsWith('.jpg')).toBe(true);
    // the catalogue's own copy is untouched
    expect(items.items.get(itemId)!.layers[0].kind === 'image' && (items.items.get(itemId)!.layers[0] as { uploadPath: string }).uploadPath.startsWith('art/')).toBe(true);
  });

  test('"customise" leaves a draft to edit and does not touch the cart', async () => {
    const { design, inCart } = await run({ color: 'black', size: 'M', customise: true, quantity: 9 });
    expect(inCart).toBe(false);
    expect(design.status).toBe('draft');
    expect(design.moderatedHash).toBeNull();
    expect(design.layers).toHaveLength(1);
    expect(await cart.list(userId)).toEqual([]);
  });

  test('ordering twice makes two separate designs', async () => {
    const a = await run({ color: 'black', size: 'M' });
    const b = await run({ color: 'black', size: 'XL' });
    expect(a.design.id).not.toBe(b.design.id);
    expect(await cart.list(userId)).toHaveLength(2);
  });

  test.each([
    ['a colour it is not made in', { color: 'white', size: 'M' }, 400],
    ['an unknown colour', { color: 'pink', size: 'M' }, 400],
    ['an unknown size', { color: 'black', size: 'XXL' }, 400],
    ['a quantity of 0', { color: 'black', size: 'M', quantity: 0 }, 400],
    ['a quantity over 50', { color: 'black', size: 'M', quantity: 51 }, 400],
  ])('refuses %s', async (_n, input, status) => {
    await expect(run(input)).rejects.toMatchObject({ status });
    expect(designs.designs.size).toBe(0); // nothing is created for a bad request
    expect(await cart.list(userId)).toEqual([]);
  });

  test('a hidden or missing design is 404', async () => {
    await items.update(itemId, { published: false });
    await expect(run({ color: 'black', size: 'M' })).rejects.toMatchObject({ status: 404 });
    await expect(run({ color: 'black', size: 'M' }, '11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({ status: 404 });
  });
});

describe('a catalogue copy can be paid for like any approved design', () => {
  let db: PGlite;
  afterEach(async () => {
    await db.close();
  });

  test('checkout accepts it and records the order', async () => {
    db = await newDb();
    const alice = await addUser(db, 'alice@example.com');
    const items = new MemoryCatalogue();
    const designs = new MemoryDesignStore();
    const cart = new MemoryCartStore();
    const made = await createCatalogueItem({ store: items, saveArt: async () => undefined, renderPreview: async () => null }, { fields, front: art(1000, 1000) });
    await items.update(made.id, { published: true });
    const { design } = await orderFromCatalogue({ items, designs, cart, copyArt: async () => undefined }, alice, made.id, { color: 'white', size: 'M', quantity: 2 });
    // mirror it into the real schema so the order's foreign key and triggers apply
    await db.query(`insert into designs (id, user_id, product, color, size, layers, back_layers, status) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'approved')`, [
      design.id, alice, design.product, design.color, design.size, JSON.stringify(design.layers), JSON.stringify(design.backLayers),
    ]);
    const delivery = { name: 'Wanjiku Mwangi', phone: '0712345678', city: 'Nairobi', county: 'Nairobi', address: 'Apt 4, Ngong Road, Kilimani' };
    const { orders } = await placeCheckout({ designs, orders: pgOrderStore(db), cart, provider: new DummyProvider() }, { userId: alice, delivery });
    expect(orders).toHaveLength(1);
    expect(orders[0].quantity).toBe(2);
  });

  test('customers cannot read the catalogue table directly (only the server can)', async () => {
    db = await newDb();
    const alice = await addUser(db, 'alice@example.com');
    await expect(asUser(db, alice, async () => db.query('select * from catalogue_items'))).rejects.toThrow(/permission denied/i);
  });
});
