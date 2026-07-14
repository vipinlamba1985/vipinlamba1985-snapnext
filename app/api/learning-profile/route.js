import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getLearningProfile, recordLearningSignal, resetLearningProfile, setLearningEnabled } from '@/lib/learning-engine';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const profile = await getLearningProfile(db, user.id);
  return json({
    profile,
    creditsUsed: 0,
    privacy: 'SnapNext learns only from explicit product choices. Sensitive traits, private message contents, passwords, payment data, and biometric identity are never inferred here.',
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const db = await getDb();

  if (body.action === 'set_enabled') {
    const profile = await setLearningEnabled(db, user.id, body.enabled !== false);
    return json({ profile, creditsUsed: 0 });
  }

  const result = await recordLearningSignal(db, user.id, { type: body.type, value: body.value }, { source: body.source || 'explicit_action' });
  if (!result.recorded && !result.disabled) return json({ error: 'Unsupported preference signal.' }, 400);
  return json({ ...result, creditsUsed: 0 });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const profile = await resetLearningProfile(db, user.id);
  return json({ ok: true, profile, creditsUsed: 0 });
}
