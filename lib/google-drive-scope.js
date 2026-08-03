// What a Google Drive grant is allowed to contain.
//
// Two things make this necessary rather than cosmetic.
//
// Google returns the scopes it actually granted, which is not always what was
// asked for: with incremental authorisation an existing wider grant can be
// carried into a new authorisation. Storing the requested scope and assuming it
// matches would hide exactly the case this migration exists to remove.
//
// And a granted scope string is not a stable value. Order varies, whitespace
// varies, and identity scopes (`openid`, `email`, `profile`) may be present
// legitimately. Comparing it for equality against one expected string would
// reject valid grants and force an endless reconnect loop.
//
// So: require the per-file scope, refuse anything that can read a whole Drive,
// and ignore the rest.
//
// No imports, so this can be reasoned about and tested without a network.

/** The only Drive scope SnapNext may hold. */
export const REQUIRED_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Drive scopes that read beyond the files a user picked. Any of these makes a
 * grant restricted, whoever issued it and whenever it was issued.
 */
export const FORBIDDEN_DRIVE_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.scripts',
]);

/** Identity scopes Google may add to a grant. Harmless, and not a mismatch. */
export const ALLOWED_EXTRA_SCOPES = Object.freeze([
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'email',
  'profile',
]);

/** Splits a scope string into a normalised, de-duplicated set. */
export function parseScopes(value) {
  return [...new Set(
    String(value || '')
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  )];
}

/**
 * Judges a grant.
 *
 * `ok` means the grant may be stored and used. Anything else must lead to the
 * connection being refused or revoked — never to it being used anyway.
 *
 * A missing scope string is treated as unsafe rather than assumed fine: legacy
 * records predate this check, and those are precisely the ones most likely to
 * carry the wide grant.
 */
export function inspectDriveGrant(grantedScope) {
  const scopes = parseScopes(grantedScope);

  if (!scopes.length) {
    return { ok: false, reason: 'unknown_scope', forbidden: [], scopes };
  }

  const forbidden = scopes.filter((scope) => FORBIDDEN_DRIVE_SCOPES.includes(scope));
  if (forbidden.length) {
    return { ok: false, reason: 'restricted_scope', forbidden, scopes };
  }

  if (!scopes.includes(REQUIRED_DRIVE_SCOPE)) {
    return { ok: false, reason: 'missing_required_scope', forbidden: [], scopes };
  }

  return { ok: true, reason: null, forbidden: [], scopes };
}

/** Convenience: true when a stored connection must be revoked and rebuilt. */
export function grantNeedsRescope(grantedScope) {
  return !inspectDriveGrant(grantedScope).ok;
}
