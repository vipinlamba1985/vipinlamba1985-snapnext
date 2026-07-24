import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MediaLibraryServiceError, applyBulkMediaAction } from '@/lib/media-library-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  try {
    return NextResponse.json(await applyBulkMediaAction({ db, userId: user.id, body }));
  } catch (error) {
    if (error instanceof MediaLibraryServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
