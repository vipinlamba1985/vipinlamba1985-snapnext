import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }

const bridge = read('lib/native/family-cast.js');
const bootstrap = read('scripts/native-bootstrap.mjs');
const androidPlugin = read('native/family-cast/android/FamilyCastPlugin.java');
const androidProvider = read('native/family-cast/android/SnapNextCastOptionsProvider.java');
const mainActivity = read('native/local-face-analysis/android/MainActivity.java');
const iosPlugin = read('native/family-cast/ios/FamilyCastPlugin.swift');
const controller = read('app/api/family-watch/route.js');
const nativeMedia = read('app/api/family-watch/native-media/route.js');
const launcher = read('components/family/FamilyWatchLauncher.js');
const familyWatch = read('lib/family-watch.js');

test('Android Family Story uses the current Google Cast framework and Default Media Receiver', () => {
  assert.match(bootstrap, /play-services-cast-framework:22\.3\.1/);
  assert.match(androidProvider, /DEFAULT_MEDIA_RECEIVER_APPLICATION_ID/);
  assert.match(androidPlugin, /MediaRouteChooserDialogFragment/);
  assert.match(androidPlugin, /RemoteMediaClient/);
  assert.match(androidPlugin, /MediaLoadRequestData/);
  assert.match(androidPlugin, /MEDIA_TYPE_PHOTO/);
  assert.match(androidPlugin, /MEDIA_TYPE_MOVIE/);
  assert.match(mainActivity, /registerPlugin\(FamilyCastPlugin\.class\)/);
  assert.match(bootstrap, /OPTIONS_PROVIDER_CLASS_NAME/);
});

test('iOS Family Story uses public AirPlay APIs and keeps mixed stories on Watch together', () => {
  assert.match(iosPlugin, /AVRoutePickerView/);
  assert.match(iosPlugin, /prioritizesVideoDevices = true/);
  assert.match(iosPlugin, /AVPlayer/);
  assert.match(iosPlugin, /allowsExternalPlayback = true/);
  assert.match(iosPlugin, /usesExternalPlaybackWhileExternalScreenIsActive = true/);
  assert.match(iosPlugin, /kind"\) == "video"/);
  assert.match(iosPlugin, /Use Watch together for mixed photo\/video stories/);
  assert.doesNotMatch(iosPlugin, /ReplayKit|RPScreenRecorder|private API/i);
});

test('native family media links are session scoped and never use the account login token', () => {
  assert.match(controller, /action === 'create-native'/);
  assert.match(controller, /nativeAccessHashes/);
  assert.match(controller, /accessTokens\.map\(hashFamilyWatchSecret\)/);
  assert.match(controller, /transport === 'airplay' && owned\.some/);
  assert.match(nativeMedia, /familyWatchSecretMatches\(token, expectedHash\)/);
  assert.match(nativeMedia, /status: 'approved'/);
  assert.match(nativeMedia, /transport: \{ \$in: \['google-cast', 'airplay'\] \}/);
  assert.match(nativeMedia, /expiresAt: \{ \$gt: now \}/);
  assert.match(nativeMedia, /Cross-Origin-Resource-Policy': 'cross-origin'/);
  assert.doesNotMatch(nativeMedia, /getUserFromRequest|Authorization|refreshToken|access_token|sb-access-token/);
});

test('native bridge stays inside Capacitor and exposes no authentication primitives', () => {
  assert.match(bridge, /registerPlugin\('FamilyCast'\)/);
  assert.match(bridge, /nativeFamilyCastCapability/);
  assert.match(bridge, /presentNativeFamilyCastPicker/);
  assert.match(bridge, /loadNativeFamilyCastMedia/);
  assert.match(bridge, /addListener\('ended'/);
  assert.doesNotMatch(bridge, /getToken\(|setToken\(|Authorization|refreshToken|password/);
});

test('Family Story UI keeps universal viewing while adding best native route', () => {
  assert.match(launcher, /Watch together works with any TV browser or computer/);
  assert.match(launcher, /Cast to TV/);
  assert.match(launcher, /AirPlay videos/);
  assert.match(launcher, /action: 'create-native'/);
  assert.match(launcher, /waitForNativeRoute/);
  assert.match(launcher, /sourceHasPhotos/);
  assert.match(launcher, /Ending the session invalidates them/);
});

test('browser and native Family Story transports remain distinct in public state', () => {
  assert.match(familyWatch, /transport = String\(session\.transport \|\| 'browser'\)/);
  assert.match(familyWatch, /pairCode: isBrowserPairing \? session\.pairCode : null/);
  assert.match(familyWatch, /verificationCode: showVerification/);
});

test('native casting does not add unrelated sensitive permissions', () => {
  const source = [bootstrap, androidPlugin, androidProvider, iosPlugin].join('\n');
  for (const permission of ['READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'READ_SMS', 'RECORD_AUDIO', 'NSContactsUsageDescription', 'NSLocationWhenInUseUsageDescription']) {
    assert.doesNotMatch(source, new RegExp(permission));
  }
});
