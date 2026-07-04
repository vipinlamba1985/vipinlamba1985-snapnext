export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

function buildText(media) {
  const desc = String(media?.aiAnalysis?.description || '').trim();
  const tags = (media?.aiAnalysis?.tags || []).filter(Boolean).slice(0, 5);
  const place = (media?.aiAnalysis?.locations || []).filter(Boolean).slice(0, 2).join(', ');
  const album = media?.aiAnalysis?.autoAlbum && !['Unprocessed', 'General'].includes(media.aiAnalysis.autoAlbum) ? media.aiAnalysis.autoAlbum : '';
  const facts = [desc, album, place].filter(Boolean);
  const main = facts.length ? facts.join(' · ') : `A saved ${media?.kind || 'memory'} from my SnapNext library.`;
  const hash = tags.length ? tags.map((t) => `#${String(t).replace(/[^a-z0-9]/gi, '')}`).filter((t) => t.length > 1).join(' ') : '#SnapNext #Memories';
  return `${main}\n\nA moment worth keeping close.\n\n${hash}`;
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body.mediaId) return Response.json({ error: { code: 'media_required', message: 'Please choose a memory first.' } }, { status: 400 });
  const db = await getDb();
  const media = await db.collection('media').findOne({ id: body.mediaId, userId: user.id, trashed: { $ne: true } });
  if (!media) return Response.json({ error: { code: 'not_found', message: 'Media not found.' } }, { status: 404 });
  return Response.json({ caption: buildText(media), meta: { fallback: true, cost: 'no_ai_inference', groundedIn: 'user_media_metadata' } });
}
