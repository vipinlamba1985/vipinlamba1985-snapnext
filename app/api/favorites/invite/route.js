import { getUserFromRequest } from '@/lib/auth';
import { inviteFavorite } from '@/lib/favorites/api-service';
import { favoritesError, favoritesJson } from '@/lib/favorites/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return favoritesJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    return favoritesJson(await inviteFavorite(user, body));
  } catch (error) {
    return favoritesError(error);
  }
}
