import { getUserFromRequest } from '@/lib/auth';
import { runFavoriteAction } from '@/lib/favorites/api-service';
import { favoritesError, favoritesJson } from '@/lib/favorites/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return favoritesJson({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const { id, action } = await params;
    return favoritesJson(await runFavoriteAction(user, id, action));
  } catch (error) {
    return favoritesError(error);
  }
}
