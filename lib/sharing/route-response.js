import { SharingApiError } from './api-contract.js';

export function sharingJson(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function sharingError(error) {
  if (error instanceof SharingApiError) {
    return sharingJson({ error: error.message, code: error.code }, error.status);
  }
  console.error('[sharing-api]', error?.message || error);
  return sharingJson({ error: 'Sharing request failed', code: 'sharing_internal_error' }, 500);
}
