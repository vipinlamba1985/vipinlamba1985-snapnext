export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { buildHashtags } from '@/lib/post-composer';
import { billingDisclosure } from '@/lib/creative-credits';

// Deterministic: built from the user's own tags and caption wording, so it
// calls no provider and consumes no credits on any plan. If this ever becomes
// a model call it must move to billing 'ai_credits' and reserve through
// lib/ai/gateway.js first — tests/creative-credit-policy.test.mjs enforces it.
export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = String(body?.text || '').trim().slice(0, 5_000);
  const mediaId = String(body?.mediaId || '').trim().slice(0, 100);
  if (!text && !mediaId) {
    return Response.json({ error: { code: 'text_required', message: 'Write or generate a caption first.' } }, { status: 400 });
  }

  let tags = [];
  if (mediaId) {
    const db = await getDb();
    const media = await db.collection('media').findOne(
      { id: mediaId, userId: user.id, trashed: { $ne: true } },
      { projection: { _id: 0, userTags: 1, 'aiAnalysis.tags': 1 } },
    );
    if (!media) return Response.json({ error: { code: 'not_found', message: 'Media not found.' } }, { status: 404 });
    tags = [...(media.userTags || []), ...(media.aiAnalysis?.tags || [])].filter(Boolean);
  }

  const hashtags = buildHashtags({ text, tags });
  return Response.json({
    hashtags: hashtags.join(' '),
    list: hashtags,
    billing: billingDisclosure('post_hashtags'),
    meta: { fallback: true, cost: 'no_ai_inference', groundedIn: 'user_media_metadata' },
  });
}
