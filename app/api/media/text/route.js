import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MediaLibraryServiceError, createTextMedia } from '@/lib/media-library-service';
import { markMagicManifestDirty } from '@/lib/magic-manifest.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  try {
    const item = await createTextMedia({ db, userId: user.id, body });
    await markMagicManifestDirty(db, user.id, 'asset_added').catch((error) => {
      console.error('[media-text] could not mark Magic manifest dirty:', error?.message || error);
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof MediaLibraryServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
