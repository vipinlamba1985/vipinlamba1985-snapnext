export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { deleteUserAccountData } from '@/lib/account-deletion';

function isSameSiteRequest(request) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return false;
  if (site && !['same-origin', 'same-site', 'none'].includes(site)) return false;
  return true;
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameSiteRequest(request)) return Response.json({ error: 'Cross-site account deletion request blocked.' }, { status: 403 });

  const db = await getDb();
  const cleanup = await deleteUserAccountData({ db, userId: user.id });
  await db.collection('users').deleteOne({ id: user.id });

  if (supabaseAdmin && user.supabaseUserId) {
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.supabaseUserId);
      if (error) throw error;
    } catch (error) {
      console.error('[delete-account] Supabase user delete failed', error?.message);
    }
  }

  return Response.json({
    ok: true,
    message: 'Account and all data deleted successfully.',
    cleanup: { aiIndex: cleanup.aiIndex, storageFailures: cleanup.storageFailures.length },
  });
}
