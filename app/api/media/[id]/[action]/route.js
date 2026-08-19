import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MediaLibraryServiceError, applyMediaAction } from '@/lib/media-library-service';
import { markMagicManifestDirty } from '@/lib/magic-manifest.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dirtyReason(action) {
  if (action === 'favorite') return 'favorite_changed';
  if (action === 'trash') return 'asset_trashed';
  if (action === 'restore') return 'asset_restored';
  if (action === 'delete') return 'asset_deleted';
  return 'asset_changed';
}

export async function POST(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action } = await context.params;
  const db = await getDb();
  try {
    const result = await applyMediaAction({
      db,
      userId: user.id,
      id: String(id || ''),
      action: String(action || ''),
    });
    await markMagicManifestDirty(db, user.id, dirtyReason(String(action || '')));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MediaLibraryServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
