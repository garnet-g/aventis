import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { savePrices } from '@/lib/prices';
import { supabasePriceStore } from '@/lib/pricesStore';

export async function PUT(req: Request) {
  await requireAdmin();
  try {
    const prices = await savePrices(supabasePriceStore(), await req.json().catch(() => null));
    return NextResponse.json({ prices });
  } catch (e) {
    return errorResponse(e);
  }
}
