import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/auth';
import { submitDesign } from '@/lib/designs';
import { supabaseDesignStore } from '@/lib/designsStore';
import { errorResponse } from '@/lib/http';
import { getImageSafetyProvider } from '@/lib/moderation/image';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { id } = await params;
    return NextResponse.json(await submitDesign(supabaseDesignStore(), getImageSafetyProvider(), id, user.id));
  } catch (e) {
    return errorResponse(e);
  }
}
