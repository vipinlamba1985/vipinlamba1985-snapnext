import { getUserFromRequest } from '@/lib/auth';
import { listTrustedCircle } from '@/lib/trusted-circle/api-service';
import { trustedCircleError, trustedCircleJson } from '@/lib/trusted-circle/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return trustedCircleJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    return trustedCircleJson(await listTrustedCircle(user));
  } catch (error) {
    return trustedCircleError(error);
  }
}
