export const SMART_SYNC_PROVIDERS = {
  google_drive: {
    id: 'google_drive',
    name: 'Google Drive',
    surface: 'web',
    auth: 'oauth',
    env: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'priority'],
  },
  google_photos: {
    id: 'google_photos',
    name: 'Google Photos',
    surface: 'web',
    auth: 'oauth',
    env: ['GOOGLE_PHOTOS_CLIENT_ID', 'GOOGLE_PHOTOS_CLIENT_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'albums', 'favorites', 'priority'],
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    surface: 'web',
    auth: 'oauth',
    env: ['DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'priority'],
  },
  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    surface: 'web',
    auth: 'oauth',
    env: ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET', 'ONEDRIVE_TENANT_ID'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'albums', 'priority'],
  },
  ios_photos: {
    id: 'ios_photos',
    name: 'iPhone & iPad Photos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'people', 'background_upload', 'priority'],
  },
  android_media: {
    id: 'android_media',
    name: 'Android Photos & Videos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'people', 'background_upload', 'priority'],
  },
};

export function providerStatus(provider) {
  const configured = provider.env.every(key => Boolean(process.env[key]));
  return {
    ...provider,
    configured: provider.surface === 'native' ? true : configured,
    availability: provider.surface === 'native' ? 'native_app_required' : configured ? 'ready' : 'credentials_required',
  };
}

export function listProviderStatus() {
  return Object.values(SMART_SYNC_PROVIDERS).map(providerStatus);
}
