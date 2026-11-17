import sharp from 'sharp';

export type SafetyScores = {
  /** 0 (safe) to 1 (certainly sexually explicit) */
  explicit: number;
  /** Other harms by category (hate, violence, ...), 0 to 1. These send a design to a person, never reject it. */
  other?: Record<string, number>;
};

export interface ImageSafetyProvider {
  score(image: Buffer): Promise<SafetyScores>;
}

/** Checks look at a 768 px copy: plenty to judge by, and a phone photo no longer means megabytes of upload per check. */
export async function downsizeForCheck(image: Buffer): Promise<Buffer> {
  try {
    return await sharp(image, { failOn: 'none' }).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  } catch {
    return image; // not something sharp reads: let the service judge the original
  }
}

/** Fixed-score provider for tests and local development. */
export class StubImageSafetyProvider implements ImageSafetyProvider {
  constructor(private readonly value = 0) {}
  async score() {
    return { explicit: this.value };
  }
}

/** OpenAI omni-moderation (accepts images, no per-call cost). Sexual scores can reject; other harms go to review. */
export class OpenAIImageSafetyProvider implements ImageSafetyProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async score(original: Buffer): Promise<SafetyScores> {
    const image = await downsizeForCheck(original);
    const res = await this.fetchImpl('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } }],
      }),
    });
    if (!res.ok) throw new Error(`moderation API returned ${res.status}`);
    const body = (await res.json()) as { results: { category_scores: Record<string, number> }[] };
    const s = body.results[0].category_scores;
    const { sexual = 0, 'sexual/minors': minors = 0, ...other } = s;
    return { explicit: Math.max(sexual, minors), other };
  }
}

/** With no API key: local dev gets a permissive stub; production fails toward human review. */
export function getImageSafetyProvider(): ImageSafetyProvider {
  const key = process.env.OPENAI_API_KEY;
  if (key) return new OpenAIImageSafetyProvider(key);
  if (process.env.NODE_ENV === 'production') {
    return { score: async () => Promise.reject(new Error('no image-safety provider configured')) };
  }
  return new StubImageSafetyProvider(0);
}
