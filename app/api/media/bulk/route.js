import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MediaLibraryServiceError, applyBulkMediaAction } from '@/lib/media-library-service';
import { markMagicManifestDirty } from '@/lib/magic-manifest.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dirtyReason(action) {
  if (action === 'favorite' || action === 'unfavorite') return 'favorite_changed';
  if (action === 'trash') return 'asset_trashed';
  if (action === 'restore') return 'asset_restored';
  if (action === 'delete') return 'asset_deleted';
  return 'asset_changed';
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  try {
    const result = await applyBulkMediaAction({ db, userId: user.id, body });
    await markMagicManifestDirty(db, user.id, dirtyReason(String(body?.action || ''))).catch((error) => {
      console.error('[media-bulk] could not mark Magic manifest dirty:', error?.message || error);
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MediaLibraryServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
