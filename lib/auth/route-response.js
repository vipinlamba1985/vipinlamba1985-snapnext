import { AuthApiError } from './api-contract.js';

export function authJson(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function authError(error) {
  if (error instanceof AuthApiError) {
    return authJson({ error: error.message, code: error.code }, error.status);
  }
  console.error('[auth-api]', error?.message || error);
  return authJson({ error: 'Authentication request failed', code: 'auth_internal_error' }, 500);
}
