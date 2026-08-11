// Contracts for on-device PEOPLE IDENTITY scanning. NOTHING HERE IS IMPLEMENTED.
//
// SnapNext now has a separate count-only `LocalFaceAnalysis` native plugin used
// by the cloud safety gate. That detector answers only "how many faces are in
// this user-selected photo?" It does not create people, embeddings or identity
// clusters and therefore does not implement any capability described below.
//
// These types describe the broader native People capability SnapNext does not
// have yet. They exist so the web layer, upload plan and a future scanner can be
// built against the same shape, and so nobody confuses face detection with
// face recognition.
//
// The platform truth this encodes, because getting it wrong wastes weeks:
//
//   Photo-library permission grants access to media. It does not grant access
//   to face identities. Apple does not expose the Photos People album through
//   PhotoKit, and Android MediaStore has no equivalent. There is no OS-supplied
//   `confirmedPersonIds`.
//
// So `confirmedPersonIds` are SnapNext's own local identifiers, produced by
// SnapNext's own on-device detection, embedding, grouping and — crucially —
// user confirmation. They are filtering metadata, never proof of identity and
// never an authorisation control. The server continues to verify every uploaded
// file independently.
//
// Face detection is not face recognition. Locating a face is available on both
// platforms and is now used by the separate count-only gate; deciding two faces
// are the same person still needs a separate embedding model that has not been
// selected. See docs/adr/0001-native-media-intelligence.md.

/**
 * Whether this device can scan People identities at all.
 *
 * Deliberately a discriminated result rather than a boolean: "no" always
 * carries a reason, because "scanning is unavailable" and "scanning is
 * unavailable because the People plugin was never installed" lead to different
 * product decisions.
 *
 * @typedef {{ supported: false, reason: NativeScanUnsupportedReason }
 *   | { supported: true, platform: 'ios' | 'android', modelVersion: string }} NativePeopleScanCapability
 *
 * @typedef {'native_plugin_missing'
 *   | 'platform_unsupported'
 *   | 'permission_unavailable'
 *   | 'model_unavailable'} NativeScanUnsupportedReason
 */

/**
 * Photo access as the platform reports it. `limited` is a real iOS state and
 * not an error: the user chose some photos, and a scan must work within that
 * set rather than asking again.
 *
 * @typedef {'not_requested' | 'limited' | 'full' | 'denied' | 'restricted'} NativePhotoAccess
 */

/**
 * A locally generated person identifier. Random — never derived from a name,
 * an email, a filename or anything about the face itself.
 *
 * @typedef {string} LocalPersonId
 */

/**
 * A group of faces the device believes are one person, pending confirmation.
 * `userConfirmed` matters: an unconfirmed cluster is a guess and must never
 * drive an upload on its own.
 *
 * @typedef {{
 *   localPersonId: LocalPersonId,
 *   representativeAssetIds: string[],
 *   estimatedAssetCount: number,
 *   userConfirmed: boolean,
 *   localLabel?: string,
 * }} NativePeopleCluster
 */

/**
 * @typedef {{
 *   phase: 'enumerating' | 'thumbnailing' | 'detecting' | 'embedding'
 *     | 'clustering' | 'awaiting_review' | 'complete' | 'cancelled' | 'failed',
 *   processedAssets: number,
 *   totalAssets?: number,
 *   discoveredClusters: number,
 * }} NativePeopleScanProgress
 */

/**
 * One asset as the device reports it, matching what `validateNativeManifest`
 * already accepts. `confirmedPersonIds` is optional on purpose — manual
 * selection, favourites, albums and date ranges are all valid without it.
 *
 * @typedef {{
 *   localAssetId: string,
 *   mediaType: 'image' | 'video',
 *   capturedAt?: string,
 *   byteSize?: number,
 *   favorite?: boolean,
 *   albumIds?: string[],
 *   confirmedPersonIds?: LocalPersonId[],
 * }} NativeAssetManifestItem
 */

/**
 * The interface a future Capacitor People scanner must satisfy.
 *
 * Everything below runs on the device. Embeddings, face crops, cluster
 * centroids and local labels never cross this boundary — only the final
 * manifest of assets the user approved does.
 *
 * @typedef {{
 *   getCapability(): Promise<NativePeopleScanCapability>,
 *   requestPhotoAccess(): Promise<NativePhotoAccess>,
 *   startScan(options?: { includePhotos?: boolean, includeVideos?: boolean, resumePreviousScan?: boolean }): Promise<{ scanId: string }>,
 *   pauseScan(scanId: string): Promise<void>,
 *   resumeScan(scanId: string): Promise<void>,
 *   cancelScan(scanId: string): Promise<void>,
 *   getProgress(scanId: string): Promise<NativePeopleScanProgress>,
 *   getClusters(scanId: string): Promise<NativePeopleCluster[]>,
 *   confirmPeople(scanId: string, localPersonIds: LocalPersonId[]): Promise<void>,
 *   getConfirmedAssetManifest(scanId: string, localPersonIds: LocalPersonId[]): Promise<NativeAssetManifestItem[]>,
 *   deleteLocalPeopleIndex(): Promise<void>,
 * }} NativePeopleScanner
 */

/** Reasons the capability check can report, for exhaustive handling. */
export const SCAN_UNSUPPORTED_REASONS = Object.freeze([
  'native_plugin_missing',
  'platform_unsupported',
  'permission_unavailable',
  'model_unavailable',
]);

export const PHOTO_ACCESS_STATES = Object.freeze([
  'not_requested', 'limited', 'full', 'denied', 'restricted',
]);

export const SCAN_PHASES = Object.freeze([
  'enumerating', 'thumbnailing', 'detecting', 'embedding',
  'clustering', 'awaiting_review', 'complete', 'cancelled', 'failed',
]);

/**
 * The only People-identity capability answer this repository can honestly give.
 *
 * The count-only LocalFaceAnalysis plugin is intentionally insufficient here:
 * no People scanner exists, no embedding model has been selected, and no local
 * identity grouping has been implemented. Returning a mock success — even
 * behind a flag — would let UI promise a capability the device cannot perform.
 *
 * @returns {NativePeopleScanCapability}
 */
export function nativePeopleScanCapability() {
  return { supported: false, reason: 'native_plugin_missing' };
}

/** True when People identity scanning may be offered. Always false today. */
export function canOfferPeopleScan() {
  return nativePeopleScanCapability().supported === true;
}
