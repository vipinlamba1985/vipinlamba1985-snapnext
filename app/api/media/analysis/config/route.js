import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { intelligenceConfig, MAGIC_ANALYSIS_VERSION } from '@/lib/intelligence/config';
import { hasLocalFaceDetectionConsent } from '@/lib/intelligence/face-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = intelligenceConfig();
  const rolloutEnabled = Boolean(config.magicSorterEnabled && config.localFaceGateEnabled);
  let consentReady = !config.localConsentRequired;
  if (config.localConsentRequired) {
    const db = await getDb();
    const account = await db.collection('users').findOne(
      { id: user.id },
      { projection: { localFaceDetectionConsent: 1 } },
    );
    consentReady = hasLocalFaceDetectionConsent(account || {});
  }

  return NextResponse.json({
    enabled: Boolean(rolloutEnabled && consentReady),
    rolloutEnabled,
    consentReady,
    version: MAGIC_ANALYSIS_VERSION,
  });
}
