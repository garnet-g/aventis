import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from '@/lib/orders';

/** Maps known errors to customer-friendly responses; anything unknown is a plain 500 with no details. */
export function errorResponse(e: unknown) {
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json({ error: first?.message || 'Invalid request.' }, { status: 400 });
  }
  if (e instanceof Error) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (/changed while/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 409 });
    if (/not found/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 404 });
    if (/add something|invalid upload/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
