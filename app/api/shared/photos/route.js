import { getUserFromRequest } from '@/lib/auth';
import { listSharedPhotos, sharePhotos } from '@/lib/sharing/api-service';
import { sharingError, sharingJson } from '@/lib/sharing/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return sharingJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    return sharingJson(await listSharedPhotos(user));
  } catch (error) {
    return sharingError(error);
  }
}

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return sharingJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    return sharingJson(await sharePhotos(user, body));
  } catch (error) {
    return sharingError(error);
  }
}
