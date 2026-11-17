/** Shown when the request never reached the server (no signal, airplane mode, server unreachable). */
export const OFFLINE_MESSAGE = 'No connection. Check your internet and try again.';

export type SendResult = { ok: boolean; status: number; body: Record<string, unknown> };

/**
 * fetch for buttons and forms in the browser. It never throws: a lost connection comes back as status 0 with
 * OFFLINE_MESSAGE, so callers always reach the code that re-enables the button and shows a message.
 */
export async function send(url: string, init?: RequestInit): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, body: { error: OFFLINE_MESSAGE } };
  }
  const parsed: unknown = await res.json().catch(() => null);
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  return { ok: res.ok, status: res.status, body };
}

/** JSON request body and headers, for `send(url, json('POST', {...}))`. */
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

/** The server's message, or `fallback` when it gave none. */
export const errorText = (r: SendResult, fallback: string) => (typeof r.body.error === 'string' && r.body.error) || fallback;
