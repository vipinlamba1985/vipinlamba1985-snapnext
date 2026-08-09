import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { LOCAL_FACE_DETECTION_CONSENT_VERSION, intelligenceConfig } from '@/lib/intelligence/config';
import { hasLocalFaceDetectionConsent } from '@/lib/intelligence/face-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function available() {
  const config = intelligenceConfig();
  return Boolean(config.magicSorterEnabled && config.localFaceGateEnabled);
}

function publicState(user = {}) {
  const consent = user.localFaceDetectionConsent || {};
  return {
    available: available(),
    version: LOCAL_FACE_DETECTION_CONSENT_VERSION,
    granted: hasLocalFaceDetectionConsent(user),
    grantedAt: consent.grantedAt || null,
    revokedAt: consent.revokedAt || null,
  };
}

async function loadUser(db, userId) {
  return db.collection('users').findOne({ id: userId }, { projection: { localFaceDetectionConsent: 1 } });
}

export async function GET(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  return NextResponse.json(publicState(await loadUser(db, authUser.id) || {}));
}

export async function POST(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!available()) {
    return NextResponse.json({ error: 'Local face organization is not enabled for this environment yet.', code: 'local_face_rollout_disabled' }, { status: 409 });
  }
  const db = await getDb();
  const now = new Date();
  await db.collection('users').updateOne(
    { id: authUser.id },
    {
      $set: {
        localFaceDetectionConsent: {
          granted: true,
          version: LOCAL_FACE_DETECTION_CONSENT_VERSION,
          grantedAt: now,
          revokedAt: null,
        },
      },
    },
  );
  return NextResponse.json({ ok: true, ...publicState(await loadUser(db, authUser.id) || {}) });
}

export async function DELETE(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const current = await loadUser(db, authUser.id) || {};
  if (!hasLocalFaceDetectionConsent(current)) return NextResponse.json({ ok: true, idempotent: true, ...publicState(current) });
  const now = new Date();
  await db.collection('users').updateOne(
    { id: authUser.id },
    {
      $set: {
        'localFaceDetectionConsent.granted': false,
        'localFaceDetectionConsent.version': LOCAL_FACE_DETECTION_CONSENT_VERSION,
        'localFaceDetectionConsent.revokedAt': now,
      },
    },
  );
  return NextResponse.json({ ok: true, ...publicState(await loadUser(db, authUser.id) || {}) });
}
