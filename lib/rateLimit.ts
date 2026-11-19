import { HttpError } from '@/lib/errors';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * Counts one request against `key` and refuses with 429 once more than `max` arrive within `windowSeconds`.
 * Keys are per user (e.g. "upload:<user id>"). If the counter can't be reached the request is allowed (and logged):
 * a database hiccup should not lock customers out.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number, opts: { failClosed?: boolean } = {}): Promise<void> {
  if (process.env.RATE_LIMITS === 'off') return;
  const { data, error } = await getServiceClient().rpc('hit_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    // Limits that protect other people (M-Pesa prompts to a phone) block when they can't be checked.
    if (opts.failClosed) throw new HttpError(503, 'Payments are busy right now. Please try again in a minute.');
    console.error('rate limit check failed; allowing the request', error.message);
    return;
  }
  if (data === false) throw new HttpError(429, 'Too many requests. Please wait a few minutes and try again.');
}

/** The limits per signed-in customer, in one place. */
export const LIMITS = {
  pay: [10, 10 * 60],
  upload: [40, 60 * 60],
  submit: [30, 60 * 60],
  preview: [300, 60 * 60],
  catalogueOrder: [40, 60 * 60],
  saveDesign: [900, 60 * 60],
  cart: [300, 60 * 60],
  paymentStatus: [200, 10 * 60],
  account: [10, 60 * 60],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * A guest can start a new guest session to get fresh per-account limits, so guests also share a limit per IP
 * address. Many Kenyan mobile customers share one address (carrier NAT), so it is ten times the per-account one:
 * enough for a busy network, but it stops one person from creating guests without end.
 */
export const GUEST_IP_FACTOR = 10;

/**
 * The visitor's address as the reverse proxy saw it (X-Real-IP, else the last X-Forwarded-For entry), or null.
 * These headers are only trustworthy because the app is reachable through the proxy alone (it listens on
 * 127.0.0.1, see the README) and the proxy overwrites X-Real-IP with the real peer address.
 */
export function clientIp(h: { get(name: string): string | null }): string | null {
  const real = h.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = h.get('x-forwarded-for')?.split(',').map((p) => p.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? null;
}

let warnedNoIp = false;

type Who = string | { id: string; is_anonymous?: boolean };

export async function limit(name: keyof typeof LIMITS, who: Who) {
  const [max, windowSeconds] = LIMITS[name];
  const id = typeof who === 'string' ? who : who.id;
  await rateLimit(`${name}:${id}`, max, windowSeconds);
  if (typeof who !== 'string' && who.is_anonymous) {
    const { headers } = await import('next/headers');
    const ip = clientIp(await headers());
    // No address (no proxy in front, e.g. local development): skip this limit rather than put every guest in one
    // shared bucket, which would let one person lock all guests out. The per-account limit above still applies.
    if (!ip) {
      if (!warnedNoIp && process.env.NODE_ENV === 'production') console.warn('rate limits: no X-Real-IP header; is the reverse proxy setting it?');
      warnedNoIp = true;
      return;
    }
    await rateLimit(`${name}:guest-ip:${ip}`, max * GUEST_IP_FACTOR, windowSeconds);
  }
}
