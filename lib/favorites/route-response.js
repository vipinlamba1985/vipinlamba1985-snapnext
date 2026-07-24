import { FavoritesApiError } from './api-contract.js';

export function favoritesJson(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function favoritesError(error) {
  if (error instanceof FavoritesApiError) {
    return favoritesJson({ error: error.message, code: error.code }, error.status);
  }
  console.error('[favorites-api]', error?.message || error);
  return favoritesJson({ error: 'Favorite request failed', code: 'favorites_internal_error' }, 500);
}
