import { HttpError } from '@/lib/errors';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * Counts one request against `key` and refuses with 429 once more than `max` arrive within `windowSeconds`.
 * Keys are per user (e.g. "upload:<user id>"). If the counter can't be reached the request is allowed (and logged):
 * a database hiccup should not lock customers out.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  if (process.env.RATE_LIMITS === 'off') return;
  const { data, error } = await getServiceClient().rpc('hit_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
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
} as const satisfies Record<string, readonly [number, number]>;

export const limit = (name: keyof typeof LIMITS, userId: string) => rateLimit(`${name}:${userId}`, LIMITS[name][0], LIMITS[name][1]);
