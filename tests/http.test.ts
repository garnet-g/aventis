import { redirect } from 'next/navigation';
import { describe, expect, test, vi } from 'vitest';
import { ZodError } from 'zod';
import { errorResponse, readJsonObject } from '@/lib/http';
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

describe('readJsonObject', () => {
  const req = (body: string) => new Request('http://x/api', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

  test('returns the object that was sent', async () => {
    expect(await readJsonObject(req('{"designId":"abc"}'))).toEqual({ designId: 'abc' });
  });

  test.each([['malformed', '{not json'], ['empty', ''], ['an array', '[1,2]'], ['a number', '42'], ['null', 'null']])(
    'a %s body is a 400 with a plain message, not a 500',
    async (_name, body) => {
      const e = await readJsonObject(req(body)).catch((err: unknown) => err);
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(400);
      expect(errorResponse(e).status).toBe(400);
    },
  );
});

describe('validation messages', () => {
  test("Zod's developer wording is never shown; our own messages are", async () => {
    const zodWording = new ZodError([{ code: 'invalid_value', values: ['tee', 'hoodie'], message: 'Invalid option: expected one of "tee"|"hoodie"', path: ['product'] } as never]);
    expect((await errorResponse(zodWording).json()).error).toMatch(/could not be read/i);
    const ours = new ZodError([{ code: 'custom', message: 'Enter a Kenyan mobile number like 0712345678.', path: ['phone'] }]);
    expect((await errorResponse(ours).json()).error).toBe('Enter a Kenyan mobile number like 0712345678.');
  });
});

describe('the visitor address behind the reverse proxy', () => {
  test('X-Real-IP first, else the last X-Forwarded-For entry (the one the proxy added)', async () => {
    const { clientIp } = await import('@/lib/rateLimit');
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(clientIp(h({ 'x-real-ip': '41.90.1.2', 'x-forwarded-for': '1.1.1.1' }))).toBe('41.90.1.2');
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9, 41.90.1.2' }))).toBe('41.90.1.2'); // a faked first entry is ignored
    expect(clientIp(h({}))).toBeNull(); // no proxy header: no address, rather than one shared bucket
  });
});
