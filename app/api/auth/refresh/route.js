import { refreshAccountSession } from '@/lib/auth/api-service';
import { authError, authJson } from '@/lib/auth/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    return authJson(await refreshAccountSession(body));
  } catch (error) {
    return authError(error);
  }
}
