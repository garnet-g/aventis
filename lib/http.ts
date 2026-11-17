import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from '@/lib/errors';

const UNREADABLE = 'The request could not be read. Please refresh the page and try again.';
// Zod's own wording ("Invalid option: expected one of ...") is written for developers. Our rules set their own
// plain messages; anything still in Zod's wording only happens when a request did not come from our pages.
const ZOD_DEFAULT_WORDING = /^(Invalid|Too (big|small)|Expected|Unrecognized)/;

/** Reads a JSON object from the body. An empty, malformed or non-object body is a 400, never a 500. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => undefined);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, UNREADABLE);
  return body as Record<string, unknown>;
}

/** Maps known errors to customer-friendly responses; anything unknown is a plain 500 with no details. */
export function errorResponse(e: unknown) {
  // A redirect or notFound thrown by the session check must reach Next.js, not be swallowed into a 500.
  unstable_rethrow(e);
  if (e instanceof ZodError) {
    const message = e.issues[0]?.message ?? '';
    return NextResponse.json({ error: message && !ZOD_DEFAULT_WORDING.test(message) ? message : UNREADABLE }, { status: 400 });
  }
  if (e instanceof Error) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (/changed while|already has an order/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 409 });
    if (/not found/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 404 });
    if (/add something|invalid upload/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
