import { getUserFromRequest } from '@/lib/auth';
import { getFavoritePermissions, updateFavoritePermissions } from '@/lib/favorites/api-service';
import { favoritesError, favoritesJson } from '@/lib/favorites/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return favoritesJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id } = await params;
    return favoritesJson(await getFavoritePermissions(user, id));
  } catch (error) {
    return favoritesError(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return favoritesJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return favoritesJson(await updateFavoritePermissions(user, id, body));
  } catch (error) {
    return favoritesError(error);
  }
}
