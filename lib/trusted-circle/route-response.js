import { TrustedCircleApiError } from './api-contract.js';

export function trustedCircleJson(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function trustedCircleError(error) {
  if (error instanceof TrustedCircleApiError) {
    return trustedCircleJson({ error: error.message, code: error.code }, error.status);
  }
  console.error('[trusted-circle-api]', error?.message || error);
  return trustedCircleJson({ error: 'Trusted circle request failed', code: 'trusted_circle_internal_error' }, 500);
}
