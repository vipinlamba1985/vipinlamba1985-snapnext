import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { rebuildPeopleIntelligence } from '@/lib/people-intelligence.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function publicPeopleError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (name === 'AccessDeniedException' || /not authorized to perform|no identity-based policy allows/i.test(message)) {
    return {
      status: 503,
      code: 'people_engine_permission_missing',
      error: 'People Magic is connected, but AWS permission is not enabled yet. Please enable the face-indexing permission and try again.',
    };
  }
  if (error?.code === 'people_engine_not_configured') {
    return {
      status: 503,
      code: 'people_engine_not_configured',
      error: 'People Magic is not configured for this environment yet.',
    };
  }
  return {
    status: 503,
    code: error?.code || name || 'people_index_failed',
    error: 'People Magic could not finish this scan. Please try again after the service is available.',
  };
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  try {
    const result = await rebuildPeopleIntelligence({
      db,
      userId: user.id,
      limit: body.limit || 12,
      reset: body.reset === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[people-intelligence] reindex failed', error?.name, error?.message);
    const publicError = publicPeopleError(error);
    return NextResponse.json({ error: publicError.error, code: publicError.code }, { status: publicError.status });
  }
}
