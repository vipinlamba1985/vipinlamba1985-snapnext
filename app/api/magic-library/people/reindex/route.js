import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { PEOPLE_INTELLIGENCE_VERSION } from '@/lib/people-intelligence';
import { rebuildPeopleIntelligence } from '@/lib/people-intelligence.server';
import { PEOPLE_COST_POLICY, estimatePhotoRunCost } from '@/lib/people-rekognition-capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const baseQuery = (userId) => ({ userId, trashed: { $ne: true }, kind: 'photo' });
const pendingQuery = (userId) => ({ ...baseQuery(userId), $or: [
  { 'peopleIntelligence.version': { $ne: PEOPLE_INTELLIGENCE_VERSION } },
  { 'peopleIntelligence.status': { $nin: ['completed', 'skipped', 'failed'] } },
] });

async function getStatus(db, userId) {
  const base = baseQuery(userId);
  const [total, remaining, failed, completed] = await Promise.all([
    db.collection('media').countDocuments(base),
    db.collection('media').countDocuments(pendingQuery(userId)),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.version': PEOPLE_INTELLIGENCE_VERSION, 'peopleIntelligence.status': 'failed' }),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.version': PEOPLE_INTELLIGENCE_VERSION, 'peopleIntelligence.status': { $in: ['completed', 'skipped'] } }),
  ]);
  return { version: PEOPLE_INTELLIGENCE_VERSION, total, completed, remaining, failed, needsMigration: remaining > 0 || failed > 0 };
}

function publicError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (name === 'AccessDeniedException' || /not authorized to perform|no identity-based policy allows/i.test(message)) return { status: 503, code: 'people_engine_permission_missing', error: 'People Magic is connected, but AWS permission is not enabled yet.' };
  if (error?.code === 'people_engine_not_configured') return { status: 503, code: 'people_engine_not_configured', error: 'People Magic is not configured for this environment yet.' };
  return { status: 503, code: error?.code || name || 'people_index_failed', error: 'People Magic could not finish this scan. Please try again.' };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  return NextResponse.json(await getStatus(db, user.id));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(PEOPLE_COST_POLICY.maxPhotosPerBatch, Number(body.limit || 12)));
  const estimatedMaxCost = estimatePhotoRunCost({ photos: limit, estimatedFaces: limit * 2 });
  if (estimatedMaxCost > PEOPLE_COST_POLICY.maxEstimatedUsdPerBatch) return NextResponse.json({ error: 'This batch is larger than the configured cost safety limit.', code: 'people_cost_guard_blocked' }, { status: 429 });
  const db = await getDb();
  try {
    if (body.retryFailed === true) await db.collection('media').updateMany(
      { userId: user.id, 'peopleIntelligence.version': PEOPLE_INTELLIGENCE_VERSION, 'peopleIntelligence.status': 'failed' },
      { $set: { 'peopleIntelligence.status': 'queued', 'peopleIntelligence.retryRequestedAt': new Date() }, $unset: { 'peopleIntelligence.error': '' } },
    );
    const result = await rebuildPeopleIntelligence({ db, userId: user.id, limit, reset: body.reset === true });
    return NextResponse.json({ ok: true, ...result, migration: await getStatus(db, user.id), estimatedMaxCost });
  } catch (error) {
    console.error('[people-intelligence] reindex failed', error?.name, error?.message);
    const safe = publicError(error);
    return NextResponse.json({ error: safe.error, code: safe.code }, { status: safe.status });
  }
}
