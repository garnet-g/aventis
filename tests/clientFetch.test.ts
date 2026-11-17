import { afterEach, describe, expect, test, vi } from 'vitest';
import { errorText, json, OFFLINE_MESSAGE, send } from '@/lib/clientFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('send', () => {
  test('a lost connection never throws: it comes back as status 0 with a plain message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const r = await send('/api/pay', json('POST', { delivery: {} }));
    expect(r).toEqual({ ok: false, status: 0, body: { error: OFFLINE_MESSAGE } });
    expect(errorText(r, 'fallback')).toBe(OFFLINE_MESSAGE);
  });

  test("the server's message and status are passed through", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Your cart is empty.' }), { status: 400 })));
    const r = await send('/api/pay');
    expect(r.status).toBe(400);
    expect(errorText(r, 'fallback')).toBe('Your cart is empty.');
  });

  test('a reply that is not JSON (e.g. a gateway error page) falls back to the caller message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 })));
    const r = await send('/api/pay');
    expect(r).toMatchObject({ ok: false, status: 502, body: {} });
    expect(errorText(r, 'Payment failed. Please try again.')).toBe('Payment failed. Please try again.');
  });

  test('json() builds a JSON request', () => {
    expect(json('PUT', { quantity: 2 })).toEqual({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"quantity":2}' });
  });
});
