const ADAPTERS = {
  google_drive: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    callbackPath: '/api/cloud/google-drive/callback',
    clientIdEnv: 'GOOGLE_DRIVE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_DRIVE_CLIENT_SECRET',
  },
  google_photos: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/photoslibrary.readonly'],
    callbackPath: '/api/cloud/google-photos/callback',
    clientIdEnv: 'GOOGLE_PHOTOS_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_PHOTOS_CLIENT_SECRET',
  },
  dropbox: {
    authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: ['files.metadata.read', 'files.content.read'],
    callbackPath: '/api/cloud/dropbox/callback',
    clientIdEnv: 'DROPBOX_CLIENT_ID',
    clientSecretEnv: 'DROPBOX_CLIENT_SECRET',
  },
  onedrive: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'Files.Read'],
    callbackPath: '/api/cloud/onedrive/callback',
    clientIdEnv: 'ONEDRIVE_CLIENT_ID',
    clientSecretEnv: 'ONEDRIVE_CLIENT_SECRET',
  },
};

export function oauthAdapter(providerId) {
  return ADAPTERS[providerId] || null;
}

export function oauthAdapterStatus(providerId) {
  const adapter = oauthAdapter(providerId);
  if (!adapter) return null;
  return {
    providerId,
    callbackPath: adapter.callbackPath,
    scopes: adapter.scopes,
    configured: Boolean(process.env[adapter.clientIdEnv] && process.env[adapter.clientSecretEnv]),
    missing: [adapter.clientIdEnv, adapter.clientSecretEnv].filter(key => !process.env[key]),
  };
}

export function listOAuthAdapterStatus() {
  return Object.keys(ADAPTERS).map(oauthAdapterStatus);
}
