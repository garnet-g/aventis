import { describe, expect, test } from 'vitest';
import { cronAuthorized, staleBefore } from '@/lib/cleanup';

describe('housekeeping', () => {
  const secret = 'a-long-random-cron-secret';
  test('runs only with the configured secret', () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(secret, secret)).toBe(true);
    expect(cronAuthorized('Bearer nope', secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
    expect(cronAuthorized('Bearer short', 'short')).toBe(false); // a weak secret is never accepted
    expect(cronAuthorized('Bearer anything', undefined)).toBe(false);
  });

  test('stale means untouched for 90 days', () => {
    expect(staleBefore(new Date('2026-11-17T00:00:00Z'))).toBe('2026-08-19T00:00:00.000Z');
  });
});
