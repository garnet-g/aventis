export interface ImageSafetyProvider {
  /** explicit: 0 (safe) to 1 (certainly explicit) */
  score(image: Buffer): Promise<{ explicit: number }>;
}

/** Fixed-score provider for tests and local development. */
export class StubImageSafetyProvider implements ImageSafetyProvider {
  constructor(private readonly value = 0) {}
  async score() {
    return { explicit: this.value };
  }
}

/** OpenAI omni-moderation (accepts images, no per-call cost). Scores the sexual categories. */
export class OpenAIImageSafetyProvider implements ImageSafetyProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async score(image: Buffer) {
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
    return { explicit: Math.max(s['sexual'] ?? 0, s['sexual/minors'] ?? 0) };
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
