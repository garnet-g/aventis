import { timingSafeEqual } from 'node:crypto';

/** Drafts nobody has touched for this long, never ordered and not in a cart, are deleted with their pictures. */
export const STALE_DRAFT_DAYS = 90;

/** True when the request carries the cleanup secret (compared in constant time). No secret configured: never. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export const staleBefore = (now: Date, days = STALE_DRAFT_DAYS) => new Date(now.getTime() - days * 86_400_000).toISOString();

/** Guests (designing without an account) idle this long, with no orders, are removed with what they made. */
export const GUEST_IDLE_DAYS = 30;
