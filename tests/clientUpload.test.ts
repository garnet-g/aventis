import { afterEach, describe, expect, test, vi } from 'vitest';
import { postFormWithProgress } from '@/lib/clientUpload';

type Handler = ((e?: unknown) => void) | null;

/** A minimal stand-in for the browser's XMLHttpRequest. */
class FakeXhr {
  static last: FakeXhr;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: Handler = null;
  onerror: Handler = null;
  ontimeout: Handler = null;
  status = 0;
  response: unknown = null;
  responseType = '';
  opened: [string, string] | null = null;
  sent: unknown = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.opened = [method, url];
  }
  send(body: unknown) {
    this.sent = body;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('postFormWithProgress', () => {
  test('reports whole-number percentages while uploading and resolves with status and JSON body', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const seen: number[] = [];
    const form = new FormData();
    const promise = postFormWithProgress('/api/x', form, (p) => seen.push(p));
    const x = FakeXhr.last;
    expect(x.opened).toEqual(['POST', '/api/x']);
    expect(x.sent).toBe(form);
    x.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 3 });
    x.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 3 });
    x.status = 200;
    x.response = { path: 'a/b/c.png' };
    x.onload?.();
    await expect(promise).resolves.toEqual({ status: 200, body: { path: 'a/b/c.png' } });
    expect(seen).toEqual([33, 100]);
  });

  test('ignores progress events whose size is unknown', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const seen: number[] = [];
    const promise = postFormWithProgress('/api/x', new FormData(), (p) => seen.push(p));
    FakeXhr.last.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 });
    FakeXhr.last.onload?.();
    await promise;
    expect(seen).toEqual([]);
  });

  test('a response that is not JSON still resolves, with a null body', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = postFormWithProgress('/api/x', new FormData(), () => undefined);
    FakeXhr.last.status = 502;
    FakeXhr.last.response = null;
    FakeXhr.last.onload?.();
    await expect(promise).resolves.toEqual({ status: 502, body: null });
  });

  test('a network failure rejects with a plain message', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = postFormWithProgress('/api/x', new FormData(), () => undefined);
    FakeXhr.last.onerror?.();
    await expect(promise).rejects.toThrow(/network/i);
  });
});

describe('shrinking photos before upload', () => {
  test('only big JPEGs shrink; PNGs (maybe transparent) never do', async () => {
    const { shouldShrink } = await import('@/lib/clientUpload');
    expect(shouldShrink({ type: 'image/jpeg', size: 5_000_000 })).toBe(true);
    expect(shouldShrink({ type: 'image/jpeg', size: 500_000 })).toBe(false);
    expect(shouldShrink({ type: 'image/jpeg', size: 500_000 }, { width: 6000, height: 4000 })).toBe(true);
    expect(shouldShrink({ type: 'image/png', size: 9_000_000 })).toBe(false);
  });

  test('keeps the shape and enough pixels for print', async () => {
    const { shrinkSize } = await import('@/lib/clientUpload');
    expect(shrinkSize(6000, 4000)).toEqual({ width: 4000, height: 2667 });
    expect(shrinkSize(3000, 4500)).toEqual({ width: 2667, height: 4000 });
    expect(shrinkSize(1200, 900)).toEqual({ width: 1200, height: 900 });
  });
});
