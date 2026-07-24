import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MediaLibraryServiceError, applyMediaAction } from '@/lib/media-library-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action } = await context.params;
  const db = await getDb();
  try {
    return NextResponse.json(await applyMediaAction({
      db,
      userId: user.id,
      id: String(id || ''),
      action: String(action || ''),
    }));
  } catch (error) {
    if (error instanceof MediaLibraryServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
