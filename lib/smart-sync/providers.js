// The single cloud-source registry used by Smart Import and future Auto Cloud Sync.
//
// Launch rule: web cloud access is user-selected only. Google Drive, Google
// Photos, Dropbox and OneDrive all have picker-based paths. None of these
// launch providers may fall back to whole-account/background discovery.

export const SMART_SYNC_PROVIDERS = {
  google_drive: {
    id: 'google_drive',
    name: 'Google Drive',
    surface: 'web',
    auth: 'picker_oauth',
    env: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['user_picker', 'manual_import'],
    syncStrategy: 'user_selected_picker',
    launchMode: 'smart_import',
    connectPath: '/cloud/google-drive/start',
    description: 'Choose only the photos and videos you want from Google Drive.',
  },
  google_photos: {
    id: 'google_photos',
    name: 'Google Photos',
    surface: 'web',
    auth: 'picker_oauth',
    env: ['GOOGLE_PHOTOS_CLIENT_ID', 'GOOGLE_PHOTOS_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['user_picker', 'manual_import'],
    syncStrategy: 'user_selected_picker',
    launchMode: 'smart_import',
    connectPath: '/smart-sync/oauth/google_photos/start',
    description: 'Pick exactly the memories you want from Google Photos.',
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    surface: 'web',
    auth: 'hosted_picker',
    env: ['DROPBOX_CLIENT_ID'],
    capabilities: ['user_picker', 'manual_import', 'documents'],
    syncStrategy: 'user_selected_picker',
    launchMode: 'smart_import',
    connectPath: null,
    description: 'Choose photos, videos, PDFs and common documents in the Dropbox Chooser. SnapNext receives only the selected files.',
  },
  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    surface: 'web',
    auth: 'hosted_picker',
    env: ['ONEDRIVE_CLIENT_ID'],
    capabilities: ['user_picker', 'manual_import', 'documents'],
    syncStrategy: 'user_selected_picker',
    launchMode: 'smart_import',
    connectPath: null,
    description: 'Choose photos, videos, PDFs and common documents in Microsoft’s hosted OneDrive picker.',
  },
  ios_photos: {
    id: 'ios_photos',
    name: 'iPhone & iPad Photos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'],
    syncStrategy: 'native_background',
    launchMode: 'native_library',
    connectPath: null,
    description: 'Choose from the device library in the SnapNext app on iPhone or iPad.',
  },
  android_media: {
    id: 'android_media',
    name: 'Android Photos & Videos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'],
    syncStrategy: 'native_background',
    launchMode: 'native_library',
    connectPath: null,
    description: 'Choose from the device library in the SnapNext Android app.',
  },
};

export const SMART_SYNC_PROVIDER_IDS = Object.keys(SMART_SYNC_PROVIDERS);

export function smartSyncProvider(providerId) {
  return SMART_SYNC_PROVIDERS[String(providerId || '').trim()] || null;
}

export function providerStatus(provider) {
  const configured = provider.env.every(key => Boolean(process.env[key]));
  let availability = 'credentials_required';
  if (provider.surface === 'native') availability = 'native_app_required';
  else if (configured && provider.syncStrategy === 'user_selected_picker') availability = 'picker_ready';
  else if (configured) availability = 'ready';
  return {
    ...provider,
    configured: provider.surface === 'native' ? true : configured,
    availability,
    launchAvailable: provider.surface === 'native' || (provider.syncStrategy === 'user_selected_picker' && configured),
  };
}

export function listProviderStatus() {
  return Object.values(SMART_SYNC_PROVIDERS).map(providerStatus);
}

export function publicProviderStatus(provider) {
  const { env: _env, ...safe } = providerStatus(provider);
  return {
    ...safe,
    available: Boolean(safe.launchAvailable),
  };
}

export function listPublicProviderStatus() {
  return Object.values(SMART_SYNC_PROVIDERS).map(publicProviderStatus);
}
