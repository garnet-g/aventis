import { beforeEach, describe, expect, test } from 'vitest';
import { decideAndNotify } from '@/lib/admin';
import type { DesignLayer } from '@/lib/designLayers';
import { layersHash, saveDesign, submitDesign } from '@/lib/designs';
import { StubImageSafetyProvider } from '@/lib/moderation/image';
import { notifyDecision, type EmailSender } from '@/lib/notify';
import { buildCustomerView, describeDesign } from '@/lib/customerItems';
import { MemoryDesignStore } from './helpers/memoryStore';

const text = (t: string): DesignLayer => ({
  kind: 'text', text: t, font: 'Arial', fill: '#111111', direction: 'ltr', fontSize: 0.12,
  rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }, rotation: 0,
});

class Outbox implements EmailSender {
  sent: { to: string; subject: string; text: string }[] = [];
  async send(m: { to: string; subject: string; text: string }) {
    this.sent.push(m);
  }
}

const siteUrl = 'https://shop.example';
let designs: MemoryDesignStore;
beforeEach(() => {
  designs = new MemoryDesignStore();
});

async function pendingDesign() {
  const d = await saveDesign(designs, 'alice', { product: 'tee', color: 'white', size: 'M', layers: [text('Dick')] });
  await submitDesign(designs, new StubImageSafetyProvider(0), d.id, 'alice');
  return d.id;
}

describe('notifyDecision', () => {
  test('approve sends an email with a checkout link', async () => {
    const out = new Outbox();
    await notifyDecision(out, siteUrl, { to: 'a@example.com', decision: 'approved', designId: 'd1' });
    expect(out.sent).toHaveLength(1);
    expect(out.sent[0].to).toBe('a@example.com');
    expect(out.sent[0].text).toContain('https://shop.example/checkout/d1');
  });

  test('reject sends the reason and a link to start again', async () => {
    const out = new Outbox();
    await notifyDecision(out, siteUrl, { to: 'a@example.com', decision: 'rejected', designId: 'd1', reason: 'Not suitable for print' });
    expect(out.sent[0].text).toContain('Not suitable for print');
    expect(out.sent[0].text).toContain('https://shop.example/design');
  });
});

describe('decideAndNotify', () => {
  test('email failure does not roll back the decision', async () => {
    const id = await pendingDesign();
    const broken: EmailSender = { send: async () => Promise.reject(new Error('smtp down')) };
    const d = await decideAndNotify({ designs, email: broken, emailFor: async () => 'a@example.com', siteUrl }, id, 'approve');
    expect(d.status).toBe('approved');
    expect((await designs.get(id))!.status).toBe('approved');
  });

  test('an approval emails the customer', async () => {
    const id = await pendingDesign();
    const out = new Outbox();
    await decideAndNotify({ designs, email: out, emailFor: async () => 'a@example.com', siteUrl }, id, 'approve');
    expect(out.sent[0].text).toContain(`/checkout/${id}`);
  });

  test('a customer with no known email is skipped without error', async () => {
    const id = await pendingDesign();
    const out = new Outbox();
    await expect(decideAndNotify({ designs, email: out, emailFor: async () => null, siteUrl }, id, 'reject', 'No')).resolves.toBeTruthy();
    expect(out.sent).toHaveLength(0);
  });
});

describe('customer status page', () => {
  const design = (over: object) => ({
    id: 'd1', userId: 'alice', product: 'tee' as const, color: 'white' as const, size: 'M' as const,
    layers: [text('Ali')], status: 'draft' as const, rejectReason: null, moderatedHash: null, version: '1', ...over,
  });

  test('waiting for review is shown in plain words', () => {
    expect(describeDesign(design({ status: 'pending_review' }), null).text).toBe('Waiting for review');
  });

  test('an approved design links to checkout', () => {
    const l = [text('Ali')];
    const s = describeDesign(design({ status: 'approved', layers: l, moderatedHash: layersHash(l) }), null);
    expect(s.text).toMatch(/approved/i);
    expect(s.action).toEqual({ href: '/checkout/d1', label: 'Pay now' });
  });

  test('an approval whose layers no longer match is not payable', () => {
    const s = describeDesign(design({ status: 'approved', moderatedHash: 'stale' }), null);
    expect(s.action?.href).not.toContain('/checkout');
  });

  test('a rejected design shows the reason and links to start over', () => {
    const s = describeDesign(design({ status: 'rejected', rejectReason: 'Not suitable' }), null);
    expect(s.text).toBe('Rejected: Not suitable');
    expect(s.action).toEqual({ href: '/design', label: 'Start a new design' });
  });

  test('a paid design shows the order status instead', () => {
    expect(describeDesign(design({ status: 'approved' }), 'shipped').text).toBe('Shipped');
  });

  test('the page lists only the signed-in customer items', () => {
    const rows = [design({ id: 'a', userId: 'alice' }), design({ id: 'b', userId: 'bob' })];
    const view = buildCustomerView('alice', rows, [
      { designId: 'a', userId: 'alice', status: 'paid' },
      { designId: 'b', userId: 'bob', status: 'delivered' },
    ]);
    expect(view.map((v) => v.design.id)).toEqual(['a']);
    expect(view[0].state.text).toBe('Paid');
  });
});
