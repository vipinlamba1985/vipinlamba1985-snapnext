import { getUserFromRequest } from '@/lib/auth';
import { runSharedAlbumAction } from '@/lib/sharing/api-service';
import { sharingError, sharingJson } from '@/lib/sharing/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return sharingJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id, action } = await params;
    const body = await request.json().catch(() => ({}));
    return sharingJson(await runSharedAlbumAction(user, id, action, body));
  } catch (error) {
    return sharingError(error);
  }
}
