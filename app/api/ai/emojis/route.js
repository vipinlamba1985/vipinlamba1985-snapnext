export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getUserFromRequest } from '@/lib/auth';
import { buildEmojis } from '@/lib/post-composer';
import { billingDisclosure } from '@/lib/creative-credits';

// Deterministic keyword matching against the caption. No provider call, so no
// credits are consumed on any plan.
export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = String(body?.text || '').trim().slice(0, 5_000);
  if (!text) {
    return Response.json({ error: { code: 'text_required', message: 'Write or generate a caption first.' } }, { status: 400 });
  }

  return Response.json({
    emojis: buildEmojis(text),
    billing: billingDisclosure('post_emojis'),
    meta: { fallback: true, cost: 'no_ai_inference', groundedIn: 'caption_text' },
  });
}
