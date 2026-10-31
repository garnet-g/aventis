import { redirect } from 'next/navigation';
import { describe, expect, test, vi } from 'vitest';
import { ZodError } from 'zod';
import { errorResponse } from '@/lib/http';
import { HttpError } from '@/lib/orders';

function thrownBy(fn: () => never): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
}

describe('errorResponse', () => {
  test('a redirect thrown by the session check is re-thrown, not turned into a 500', () => {
    const redirectError = thrownBy(() => redirect('/login'));
    expect(() => errorResponse(redirectError)).toThrow();
  });

  test('known errors map to their status codes', async () => {
    expect(errorResponse(new HttpError(403, 'no')).status).toBe(403);
    expect(errorResponse(new Error('Design not found.')).status).toBe(404);
    expect(errorResponse(new Error('Your design changed while it was being checked.')).status).toBe(409);
    expect(errorResponse(new ZodError([{ code: 'custom', message: 'bad', path: [] }])).status).toBe(400);
  });

  test('unknown errors become a generic 500 that leaks no details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = errorResponse(new Error('secret database password is hunter2'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('hunter2');
  });
});
