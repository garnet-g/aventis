import { describe, expect, test } from 'vitest';
import { moderateDesign, moderateImages, moderateText } from '@/lib/moderation';
import { OpenAIImageSafetyProvider, StubImageSafetyProvider } from '@/lib/moderation/image';

const img = Buffer.from('x');

describe('moderateText', () => {
  test('banned word in text is explicit', () => {
    expect(moderateText(['what a fuck'])).toBe('explicit');
  });

  test('obfuscated banned word with dots is explicit', () => {
    expect(moderateText(['f.u.c.k'])).toBe('explicit');
    expect(moderateText(['f u c k'])).toBe('explicit');
  });

  test('zero-width characters do not hide a banned word', () => {
    expect(moderateText(['fu​ck'])).toBe('explicit');
  });

  test('roman urdu banned word is explicit', () => {
    expect(moderateText(['tu chutiya hai'])).toBe('explicit');
  });

  test('clean Urdu-script name is clear', () => {
    expect(moderateText(['علی احمد'])).toBe('clear');
  });

  test('emoji-only text is clear and does not throw', () => {
    expect(moderateText(['🔥🔥', '❤️'])).toBe('clear');
  });

  test('innocent words containing a banned substring are clear', () => {
    expect(moderateText(['Scunthorpe Classic', 'assistant manager'])).toBe('clear');
  });

  test('ambiguous words that are also common names go to human review, not rejection', () => {
    expect(moderateText(['Dick'])).toBe('unsure');
    expect(moderateText(['Dick', 'f.u.c.k'])).toBe('explicit');
  });

  test('no texts is clear', () => {
    expect(moderateText([])).toBe('clear');
  });
});

describe('moderateImages', () => {
  test('image score 0.9 is explicit, 0.5 unsure, 0.1 clear', async () => {
    expect(await moderateImages([img], new StubImageSafetyProvider(0.9))).toBe('explicit');
    expect(await moderateImages([img], new StubImageSafetyProvider(0.5))).toBe('unsure');
    expect(await moderateImages([img], new StubImageSafetyProvider(0.1))).toBe('clear');
  });

  test('provider error yields unsure (fail toward human review, never clear)', async () => {
    const broken = { score: async () => Promise.reject(new Error('down')) };
    expect(await moderateImages([img], broken)).toBe('unsure');
  });
});

describe('moderateDesign', () => {
  test('returns the worst verdict across texts and images', async () => {
    expect(await moderateDesign({ texts: ['hello'], images: [img] }, new StubImageSafetyProvider(0.5))).toBe('unsure');
    expect(await moderateDesign({ texts: ['fuck'], images: [img] }, new StubImageSafetyProvider(0.5))).toBe('explicit');
    expect(await moderateDesign({ texts: ['Ali'], images: [img] }, new StubImageSafetyProvider(0.0))).toBe('clear');
  });
});

describe('OpenAIImageSafetyProvider', () => {
  test('uses the highest sexual category score from the API response', async () => {
    let sentBody = '';
    const fakeFetch = (async (_url: string, init: { body: string }) => {
      sentBody = init.body;
      return {
        ok: true,
        json: async () => ({ results: [{ category_scores: { sexual: 0.2, 'sexual/minors': 0.91, violence: 0.99 } }] }),
      };
    }) as unknown as typeof fetch;
    const provider = new OpenAIImageSafetyProvider('key', fakeFetch);
    expect((await provider.score(Buffer.from('abc'))).explicit).toBeCloseTo(0.91);
    expect(sentBody).toContain('omni-moderation-latest');
  });

  test('non-OK API response throws so the caller fails toward review', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(new OpenAIImageSafetyProvider('key', fakeFetch).score(img)).rejects.toThrow();
  });
});
