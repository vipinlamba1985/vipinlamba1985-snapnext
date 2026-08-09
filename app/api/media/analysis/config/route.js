import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { intelligenceConfig, MAGIC_ANALYSIS_VERSION } from '@/lib/intelligence/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = intelligenceConfig();
  return NextResponse.json({
    enabled: Boolean(config.magicSorterEnabled && config.localFaceGateEnabled && config.faceProcessingEnabled),
    version: MAGIC_ANALYSIS_VERSION,
  });
}
