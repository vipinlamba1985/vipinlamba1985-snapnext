// The single Smart Sync provider registry.
//
// This is the only place a cloud source is declared. `lib/smart-sync.js`
// re-exports the ordered array from here so there is one list rather than two
// that drift apart, and every surface — Cloud Sync, Smart Backup, the providers
// endpoint — reads from it instead of hardcoding its own copy.
//
// A provider becomes usable when its `env` keys are present in the deployment.
// Nothing is hidden behind a hand-maintained "available" flag: if the
// credentials are configured, the provider connects.

export const SMART_SYNC_PROVIDERS = {
  google_drive: {
    id: 'google_drive',
    name: 'Google Drive',
    surface: 'web',
    auth: 'oauth',
    env: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'priority'],
    syncStrategy: 'durable_cloud_job',
    // Google Drive predates the shared OAuth adapter and keeps its own route.
    connectPath: '/cloud/google-drive/start',
    description: 'Choose photos and videos already saved in Google Drive.',
  },
  google_photos: {
    id: 'google_photos',
    name: 'Google Photos',
    surface: 'web',
    auth: 'picker_oauth',
    env: ['GOOGLE_PHOTOS_CLIENT_ID', 'GOOGLE_PHOTOS_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['user_picker', 'manual_import', 'priority'],
    syncStrategy: 'user_selected_picker',
    connectPath: '/smart-sync/oauth/google_photos/start',
    description: 'Pick exactly the memories you want from Google Photos.',
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    surface: 'web',
    auth: 'oauth',
    env: ['DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'priority'],
    syncStrategy: 'durable_cloud_job',
    connectPath: '/smart-sync/oauth/dropbox/start',
    description: 'Bring in photos and videos from Dropbox.',
  },
  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    surface: 'web',
    auth: 'oauth',
    env: ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'albums', 'priority'],
    syncStrategy: 'durable_cloud_job',
    connectPath: '/smart-sync/oauth/onedrive/start',
    description: 'Bring in memories saved with Microsoft.',
  },
  ios_photos: {
    id: 'ios_photos',
    name: 'iPhone & iPad Photos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'],
    syncStrategy: 'native_background',
    connectPath: null,
    description: 'Camera-roll backup from the SnapNext app on iPhone or iPad.',
  },
  android_media: {
    id: 'android_media',
    name: 'Android Photos & Videos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'],
    syncStrategy: 'native_background',
    connectPath: null,
    description: 'Camera-roll backup from the SnapNext app on Android.',
  },
};

/** Declaration order, which is also the order surfaces display them in. */
export const SMART_SYNC_PROVIDER_IDS = Object.keys(SMART_SYNC_PROVIDERS);

export function smartSyncProvider(providerId) {
  return SMART_SYNC_PROVIDERS[String(providerId || '').trim()] || null;
}

export function providerStatus(provider) {
  const configured = provider.env.every(key => Boolean(process.env[key]));
  let availability = 'credentials_required';
  if (provider.surface === 'native') availability = 'native_app_required';
  else if (configured && provider.auth === 'picker_oauth') availability = 'picker_ready';
  else if (configured) availability = 'ready';
  return {
    ...provider,
    configured: provider.surface === 'native' ? true : configured,
    availability,
  };
}

export function listProviderStatus() {
  return Object.values(SMART_SYNC_PROVIDERS).map(providerStatus);
}

/**
 * The shape sent to browsers. Identical to providerStatus except that `env` is
 * dropped — clients need to know *whether* a provider is configured, never
 * which environment variables the deployment uses.
 */
export function publicProviderStatus(provider) {
  const { env: _env, ...safe } = providerStatus(provider);
  return {
    ...safe,
    // A web provider is usable once its credentials exist; native providers are
    // "available" in the sense that the mobile app can do the work.
    available: provider.surface === 'native' || safe.configured,
  };
}

export function listPublicProviderStatus() {
  return Object.values(SMART_SYNC_PROVIDERS).map(publicProviderStatus);
}
