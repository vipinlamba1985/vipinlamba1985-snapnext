import { getUserFromRequest } from '@/lib/auth';
import { getTrustedCirclePermissions, updateTrustedCirclePermissions } from '@/lib/trusted-circle/api-service';
import { trustedCircleError, trustedCircleJson } from '@/lib/trusted-circle/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return trustedCircleJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id } = await params;
    return trustedCircleJson(await getTrustedCirclePermissions(user, id));
  } catch (error) {
    return trustedCircleError(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return trustedCircleJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return trustedCircleJson(await updateTrustedCirclePermissions(user, id, body));
  } catch (error) {
    return trustedCircleError(error);
  }
}
