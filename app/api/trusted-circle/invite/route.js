import { getUserFromRequest } from '@/lib/auth';
import { inviteToTrustedCircle } from '@/lib/trusted-circle/api-service';
import { trustedCircleError, trustedCircleJson } from '@/lib/trusted-circle/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return trustedCircleJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    return trustedCircleJson(await inviteToTrustedCircle(user, body));
  } catch (error) {
    return trustedCircleError(error);
  }
}
