import { getUserFromRequest } from '@/lib/auth';
import { listFavorites } from '@/lib/favorites/api-service';
import { favoritesError, favoritesJson } from '@/lib/favorites/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return favoritesJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    return favoritesJson(await listFavorites(user));
  } catch (error) {
    return favoritesError(error);
  }
}
