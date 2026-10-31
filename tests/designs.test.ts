import { beforeEach, describe, expect, test } from 'vitest';
import type { DesignLayer } from '@/lib/designLayers';
import { saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import { MemoryDesignStore } from './helpers/memoryStore';

const rect = { x: 0.2, y: 0.2, width: 0.5, height: 0.3 };
const text = (t: string): DesignLayer => ({
  kind: 'text', text: t, font: 'Arial', fill: '#111111', direction: 'ltr', rect, rotation: 0,
});
const base = { product: 'tee', color: 'white', size: 'M' } as const;

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
    const path = `alice/${d0.id}/a.png`;
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
    const path = `alice/${d0.id}/a.png`;
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

describe('saveDesign', () => {
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
