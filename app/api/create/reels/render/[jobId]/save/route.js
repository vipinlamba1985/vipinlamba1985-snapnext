import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { effectivePlan } from '@/lib/entitlements';
import {
  CreateReelLibraryError,
  publishCanonicalReelToLibrary,
} from '@/lib/create-reel-library.server';

export const runtime = 'nodejs';
export const maxDuration = 30;

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function POST(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const params = await context.params;
  const artifactId = String(params?.jobId || '').trim();
  if (!artifactId) return json({ error: 'Rendered Reel id is required.', code: 'reel_library_artifact_id_required' }, 400);

  try {
    const db = await getDb();
    const artifact = await db.collection('render_artifacts').findOne({
      userId: user.id,
      id: artifactId,
    });
    if (!artifact) return json({ error: 'Rendered Reel not found.', code: 'reel_library_artifact_not_found' }, 404);

    const plan = effectivePlan(user, request);
    const saved = await publishCanonicalReelToLibrary({ db, user, plan, artifact });
    return json({
      ...saved,
      note: saved.media?.trashed
        ? 'This Reel was already saved and is currently in Trash. Restore it from Library if you want it visible again.'
        : 'The saved Reel is a separate user-owned Library copy. Your source memories remain untouched.',
    });
  } catch (error) {
    if (error instanceof CreateReelLibraryError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error('[create-reel-save] failed', error?.code || error?.name, error?.message);
    return json({ error: 'This Reel could not be saved to your Library.', code: 'reel_library_save_failed' }, 500);
  }
}
