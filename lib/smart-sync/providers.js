export const SMART_SYNC_PROVIDERS = {
  google_drive: {
    id: 'google_drive',
    name: 'Google Drive',
    surface: 'web',
    auth: 'oauth',
    env: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'priority'],
    syncStrategy: 'durable_cloud_job',
  },
  google_photos: {
    id: 'google_photos',
    name: 'Google Photos',
    surface: 'web',
    auth: 'picker_oauth',
    env: ['GOOGLE_PHOTOS_CLIENT_ID', 'GOOGLE_PHOTOS_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['user_picker', 'manual_import', 'priority'],
    syncStrategy: 'user_selected_picker',
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    surface: 'web',
    auth: 'oauth',
    env: ['DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'priority'],
    syncStrategy: 'adapter_required',
  },
  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    surface: 'web',
    auth: 'oauth',
    env: ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET', 'CLOUD_CONNECTOR_SECRET'],
    capabilities: ['browse', 'manual_import', 'auto_sync', 'folders', 'albums', 'priority'],
    syncStrategy: 'adapter_required',
  },
  ios_photos: {
    id: 'ios_photos',
    name: 'iPhone & iPad Photos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'],
    syncStrategy: 'native_background',
  },
  android_media: {
    id: 'android_media',
    name: 'Android Photos & Videos',
    surface: 'native',
    auth: 'native_permission',
    env: [],
    capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'],
    syncStrategy: 'native_background',
  },
};

export function providerStatus(provider) {
  const configured = provider.env.every(key => Boolean(process.env[key]));
  let availability = 'credentials_required';
  if (provider.surface === 'native') availability = 'native_app_required';
  else if (configured && provider.auth === 'picker_oauth') availability = 'picker_ready';
  else if (configured && provider.syncStrategy === 'adapter_required') availability = 'connection_ready_import_adapter_pending';
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
