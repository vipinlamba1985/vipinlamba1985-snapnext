import { getUserFromRequest } from '@/lib/auth';
import { runTrustedCircleAction } from '@/lib/trusted-circle/api-service';
import { trustedCircleError, trustedCircleJson } from '@/lib/trusted-circle/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return trustedCircleJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id, action } = await params;
    return trustedCircleJson(await runTrustedCircleAction(user, id, action));
  } catch (error) {
    return trustedCircleError(error);
  }
}
