import { getUserFromRequest } from '@/lib/auth';
import { getSharedAlbum } from '@/lib/sharing/api-service';
import { sharingError, sharingJson } from '@/lib/sharing/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return sharingJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id } = await params;
    return sharingJson(await getSharedAlbum(user, id));
  } catch (error) {
    return sharingError(error);
  }
}
