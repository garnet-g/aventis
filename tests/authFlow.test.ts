import { describe, expect, test } from 'vitest';
import { authErrorMessage, safeNextPath } from '@/lib/authFlow';
import { OFFLINE_MESSAGE } from '@/lib/clientFetch';

describe('authErrorMessage', () => {
  test.each([
    [{ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }, /don't match/],
    [{ code: 'user_already_exists', status: 422, message: 'User already registered' }, /already an account/],
    [{ code: 'email_not_confirmed', status: 400 }, /confirm your email/i],
    [{ code: 'weak_password', status: 422 }, /at least 8/],
    [{ code: 'over_email_send_rate_limit', status: 429 }, /too many attempts/i],
    [{ status: 429, message: 'rate limited' }, /too many attempts/i],
  ])('turns Supabase wording into a plain sentence: %o', (error, expected) => {
    expect(authErrorMessage(error)).toMatch(expected);
    expect(authErrorMessage(error)).not.toBe(error.message);
  });

  test('a network failure says there is no connection', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toBe(OFFLINE_MESSAGE);
  });

  test('anything unexpected gets a generic message, never the raw one', () => {
    expect(authErrorMessage({ code: 'unexpected_failure', status: 500, message: 'database error: relation xyz' })).toBe('Something went wrong. Please try again.');
  });
});

describe('safeNextPath', () => {
  test.each(['/cart', '/design', '/catalogue/57f809cd-a5c3-4ae3-a64b-f914db08ba33', '/reset-password', '/catalogue?p=tee'])('allows a path on this site: %s', (p) => {
    expect(safeNextPath(p)).toBe(p);
  });

  test.each([null, '', 'cart', 'https://evil.example', '//evil.example', '/\\evil.example', '/x"><script>', `/${'a'.repeat(400)}`])(
    'refuses anything that could leave the site or is malformed: %s',
    (p) => {
      expect(safeNextPath(p)).toBeNull();
    },
  );
});
