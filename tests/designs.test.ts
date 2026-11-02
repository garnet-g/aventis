import { beforeEach, describe, expect, test } from 'vitest';
import type { DesignLayer } from '@/lib/designLayers';
import { layersHash, saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import { MemoryDesignStore } from './helpers/memoryStore';

const rect = { x: 0.2, y: 0.2, width: 0.5, height: 0.3 };
const text = (t: string): DesignLayer => ({
  kind: 'text', text: t, font: 'sans', fill: '#111111', direction: 'ltr', fontSize: 0.12, rect, rotation: 0,
});
const base = { product: 'tee', color: 'white', size: 'M' } as const;
const FILE = '3f2b8c1e-9a4d-4e7b-8c55-1d2e3f4a5b6c.png'; // server-generated upload names look like this

let store: MemoryDesignStore;
beforeEach(() => {
  store = new MemoryDesignStore();
});

class CountingProvider extends StubImageSafetyProvider {
  calls = 0;
  async score() {
    this.calls++;
    return super.score();
  }
}

describe('submitDesign', () => {
  test('clear design becomes approved', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    const r = await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    expect(r.status).toBe('approved');
    expect((await store.get(d.id))!.status).toBe('approved');
  });

  test('unsure design becomes pending_review with a waiting message', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Dick')] });
    const r = await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    expect(r.status).toBe('pending_review');
    expect(r.message).toMatch(/waiting for review/i);
  });

  test('explicit design becomes rejected with a reason', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('fuck')] });
    const r = await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    expect(r.status).toBe('rejected');
    expect((await store.get(d.id))!.rejectReason).toMatch(/explicit/i);
  });

  test('an explicit uploaded image is rejected', async () => {
    const d0 = await saveDesign(store, 'alice', { ...base, layers: [] });
    const path = `alice/${d0.id}/${FILE}`;
    store.files.set(path, Buffer.from('img'));
    const d = await saveDesign(store, 'alice', { ...base, layers: [{ kind: 'image', uploadPath: path, rect, rotation: 0 }] }, d0.id);
    const r = await submitDesign(store, new StubImageSafetyProvider(0.95), d.id, 'alice');
    expect(r.status).toBe('rejected');
  });

  test('another user cannot submit my design', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    await expect(submitDesign(store, new StubImageSafetyProvider(0), d.id, 'bob')).rejects.toThrow(/not found/i);
  });

  test('an empty design cannot be submitted', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [] });
    await expect(submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice')).rejects.toThrow(/add something/i);
  });

  test('submit twice on the same unchanged design returns the same result without re-moderating', async () => {
    const provider = new CountingProvider(0);
    const d0 = await saveDesign(store, 'alice', { ...base, layers: [] });
    const path = `alice/${d0.id}/${FILE}`;
    store.files.set(path, Buffer.from('img'));
    const d = await saveDesign(store, 'alice', { ...base, layers: [{ kind: 'image', uploadPath: path, rect, rotation: 0 }] }, d0.id);
    const first = await submitDesign(store, provider, d.id, 'alice');
    const second = await submitDesign(store, provider, d.id, 'alice');
    expect(second).toEqual(first);
    expect(provider.calls).toBe(1);
  });

  test('a design approved by an admin stays approved when the customer submits again unchanged', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Dick')] });
    await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    await store.update(d.id, { status: 'approved' }); // admin decision
    const r = await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    expect(r.status).toBe('approved');
  });
});

class RacingProvider extends StubImageSafetyProvider {
  constructor(private readonly during: () => Promise<unknown>) {
    super(0);
  }
  async score() {
    await this.during();
    return super.score();
  }
}

describe('submitDesign safety under attack', () => {
  test("stored layers pointing at someone else's upload are refused at submit", async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    store.files.set(`bob/other/${FILE}`, Buffer.from('secret'));
    // bypass saveDesign, as a direct database write would
    await store.update(d.id, { layers: [{ kind: 'image', uploadPath: `bob/other/${FILE}`, rect, rotation: 0 }] });
    await expect(submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice')).rejects.toThrow(/upload/i);
  });

  test('stored layers that fail validation are refused at submit', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    await store.update(d.id, { layers: [{ ...(text('Ali') as object), rect: { x: 5, y: 5, width: 9, height: 9 } } as DesignLayer] });
    await expect(submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice')).rejects.toThrow();
  });

  test('a design edited while it is being checked is not approved', async () => {
    const d0 = await saveDesign(store, 'alice', { ...base, layers: [] });
    const path = `alice/${d0.id}/${FILE}`;
    store.files.set(path, Buffer.from('img'));
    const d = await saveDesign(store, 'alice', { ...base, layers: [{ kind: 'image', uploadPath: path, rect, rotation: 0 }] }, d0.id);
    const racing = new RacingProvider(() => saveDesign(store, 'alice', { ...base, layers: [text('Changed')] }, d.id));
    await expect(submitDesign(store, racing, d.id, 'alice')).rejects.toThrow(/changed/i);
    const after = (await store.get(d.id))!;
    expect(after.status).toBe('draft');
    expect(after.layers).toEqual([text('Changed')]);
  });
});

describe('saveDesign', () => {
  test('a design that already has an order cannot be edited', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    store.ordered.add(d.id);
    await expect(saveDesign(store, 'alice', { ...base, layers: [text('Different')] }, d.id)).rejects.toThrow(/already has an order/i);
    expect((await store.get(d.id))!.layers).toEqual([text('Ali')]);
  });

  test('flip flags on an image layer are saved, not silently dropped', async () => {
    const d0 = await saveDesign(store, 'alice', { ...base, layers: [] });
    const path = `alice/${d0.id}/${FILE}`;
    const saved = await saveDesign(store, 'alice', { ...base, layers: [{ kind: 'image', uploadPath: path, rect, rotation: 90, flipX: true, flipY: false }] }, d0.id);
    expect(saved.layers[0]).toMatchObject({ kind: 'image', rotation: 90, flipX: true, flipY: false });
  });

  test('upload file names must match the server-generated format', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [] });
    const attempt = (name: string) =>
      saveDesign(store, 'alice', { ...base, layers: [{ kind: 'image', uploadPath: `alice/${d.id}/${name}`, rect, rotation: 0 }] }, d.id);
    for (const bad of ['a.png', FILE.replace('.png', 'xpng'), FILE.replace('.png', '.PNG'), `${FILE}.exe`, `${FILE}%2e`, `x\\${FILE}`, ` ${FILE}`, `${FILE}\n`]) {
      await expect(attempt(bad)).rejects.toThrow(/upload/i);
    }
    await expect(attempt(FILE.replace('.png', '.jpg'))).resolves.toBeTruthy();
  });

  test('saving changed layers on an approved design resets status to draft', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    const saved = await saveDesign(store, 'alice', { ...base, layers: [text('Ali Khan')] }, d.id);
    expect(saved.status).toBe('draft');
  });

  test('after an edit the design is moderated again on submit', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    await saveDesign(store, 'alice', { ...base, layers: [text('fuck')] }, d.id);
    const r = await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice');
    expect(r.status).toBe('rejected');
  });

  test("another user cannot overwrite my design", async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] });
    await expect(saveDesign(store, 'bob', { ...base, layers: [text('x')] }, d.id)).rejects.toThrow(/not found/i);
  });

  test("an image layer pointing at someone else's upload is rejected", async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [] });
    const evil: DesignLayer = { kind: 'image', uploadPath: `bob/${d.id}/a.png`, rect, rotation: 0 };
    await expect(saveDesign(store, 'alice', { ...base, layers: [evil] }, d.id)).rejects.toThrow(/upload/i);
    const traversal: DesignLayer = { kind: 'image', uploadPath: `alice/${d.id}/../../bob/x/a.png`, rect, rotation: 0 };
    await expect(saveDesign(store, 'alice', { ...base, layers: [traversal] }, d.id)).rejects.toThrow(/upload/i);
  });

  test('a layer that sticks out of the print area is rejected', async () => {
    const out: DesignLayer = { ...(text('Ali') as Extract<DesignLayer, { kind: 'text' }>), rect: { x: 0.8, y: 0, width: 0.5, height: 0.2 } };
    await expect(saveDesign(store, 'alice', { ...base, layers: [out] })).rejects.toThrow(/print area/i);
  });

  test('invalid input is rejected: unknown product, text over 60 characters, more than 20 layers', async () => {
    await expect(saveDesign(store, 'alice', { ...base, product: 'cap' as never, layers: [] })).rejects.toThrow();
    await expect(saveDesign(store, 'alice', { ...base, layers: [text('x'.repeat(61))] })).rejects.toThrow();
    await expect(
      saveDesign(store, 'alice', { ...base, layers: Array.from({ length: 21 }, () => text('a')) }),
    ).rejects.toThrow();
  });
});

describe('printing on the back', () => {
  const back = (t: string) => ({ ...base, layers: [text('Front')], backLayers: [text(t)] });

  test('both sides are saved with the design', async () => {
    const d = await saveDesign(store, 'alice', back('Back'));
    expect(d.layers).toEqual([text('Front')]);
    expect(d.backLayers).toEqual([text('Back')]);
  });

  test('a design with nothing on the back has an empty back', async () => {
    expect((await saveDesign(store, 'alice', { ...base, layers: [text('Ali')] })).backLayers).toEqual([]);
  });

  test('a design with only a back side can be submitted', async () => {
    const d = await saveDesign(store, 'alice', { ...base, layers: [], backLayers: [text('Back only')] });
    expect((await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice')).status).toBe('approved');
  });

  test('explicit text that is only on the back is rejected', async () => {
    const d = await saveDesign(store, 'alice', back('fuck'));
    expect((await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice')).status).toBe('rejected');
  });

  test('changing only the back puts an approved design back to draft and it is checked again', async () => {
    const d = await saveDesign(store, 'alice', back('Fine'));
    expect((await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice')).status).toBe('approved');
    const edited = await saveDesign(store, 'alice', back('fuck'), d.id);
    expect(edited.status).toBe('draft');
    expect((await submitDesign(store, new StubImageSafetyProvider(0), d.id, 'alice')).status).toBe('rejected');
  });

  test("an upload on the back must belong to this design too", async () => {
    const d = await saveDesign(store, 'alice', back('Back'));
    const evil: DesignLayer = { kind: 'image', uploadPath: `bob/${d.id}/${FILE}`, rect, rotation: 0 };
    await expect(saveDesign(store, 'alice', { ...base, layers: [], backLayers: [evil] }, d.id)).rejects.toThrow(/upload/i);
  });

  test('each side is limited to 20 layers', async () => {
    const many = Array.from({ length: 21 }, () => text('a'));
    await expect(saveDesign(store, 'alice', { ...base, layers: [], backLayers: many })).rejects.toThrow();
  });

  test('an image on the back of a brand-new design is refused until the design exists', async () => {
    const img: DesignLayer = { kind: 'image', uploadPath: `alice/x/${FILE}`, rect, rotation: 0 };
    await expect(saveDesign(store, 'alice', { ...base, layers: [], backLayers: [img] })).rejects.toThrow(/upload/i);
  });
});

describe('the moderation hash', () => {
  test('covers both sides, so a change on either side changes it', () => {
    expect(layersHash([text('a')], [])).not.toBe(layersHash([text('a')], [text('b')]));
    expect(layersHash([text('a')], [text('b')])).not.toBe(layersHash([text('b')], [text('a')]));
    expect(layersHash([text('a')], [text('b')])).toBe(layersHash([text('a')], [text('b')]));
  });
});
