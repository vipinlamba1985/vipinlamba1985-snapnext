export const FACE_DELETION_INVENTORY = Object.freeze([
  { key: 'rekognition_collection', classification: 'delete', kind: 'aws' },
  { key: 'rekognition_favorite_people_collection', classification: 'delete', kind: 'aws' },
  { key: 'face_index', classification: 'delete', kind: 'mongo' },
  { key: 'favorite_people_recognition', classification: 'delete', kind: 'mongo' },
  { key: 'person_clusters', classification: 'delete', kind: 'mongo' },
  { key: 'media.peopleIntelligence', classification: 'delete', kind: 'mongo' },
  { key: 'magic_library_activation.active', classification: 'delete', kind: 'mongo' },
  { key: 'magic_library_activation.recognitionFavorites', classification: 'delete', kind: 'mongo' },
  { key: 'media.userConfirmedPeople', classification: 'delete', kind: 'mongo' },
  { key: 'upload_reservations.assignedPeople', classification: 'delete', kind: 'mongo' },
  { key: 'users.faceProcessingConsent', classification: 'retain_migrate', kind: 'mongo' },
  { key: 'face_deletion_requests', classification: 'retain', kind: 'mongo' },
  { key: 'media_analysis', classification: 'retain_cloud_delete', kind: 'mongo' },
  { key: 'media.magicAnalysisState', classification: 'retain', kind: 'mongo' },
  { key: 'persisted_face_crop', classification: 'not_created', kind: 'object' },
  { key: 'persisted_face_thumbnail', classification: 'not_created', kind: 'object' },
  { key: 'original_media', classification: 'retain', kind: 'object' },
]);

export const FACE_DELETE_STORE_KEYS = Object.freeze(
  FACE_DELETION_INVENTORY.filter((row) => row.classification === 'delete').map((row) => row.key),
);

export async function deleteSnapNextFaceRecognitionState({ db, userId, now = new Date() }) {
  const results = {};

  results.face_index = await db.collection('face_index').deleteMany({ userId });
  results.favorite_people_recognition = await db.collection('favorite_people_recognition').deleteMany({ userId });
  results.person_clusters = await db.collection('person_clusters').deleteMany({ userId });
  results.media = await db.collection('media').updateMany(
    { userId },
    {
      $unset: {
        peopleIntelligence: '',
        userConfirmedPeople: '',
      },
      $set: { updatedAt: now },
    },
  );
  results.magic_library_activation = await db.collection('magic_library_activation').updateMany(
    { userId },
    { $set: { active: [], recognitionFavorites: [], recognitionFavoritesGeneration: 0, updatedAt: now } },
  );
  results.upload_reservations = await db.collection('upload_reservations').updateMany(
    { userId, assignedPeople: { $exists: true } },
    { $unset: { assignedPeople: '' } },
  );

  return results;
}

export async function verifySnapNextFaceRecognitionStateDeleted({ db, userId }) {
  const [
    faceIndex,
    favoritePeopleRecognition,
    personClusters,
    mediaPeopleIntelligence,
    mediaConfirmedPeople,
    activeFaces,
    recognitionFavorites,
    reservationPeople,
  ] = await Promise.all([
    db.collection('face_index').countDocuments({ userId }),
    db.collection('favorite_people_recognition').countDocuments({ userId }),
    db.collection('person_clusters').countDocuments({ userId }),
    db.collection('media').countDocuments({ userId, peopleIntelligence: { $exists: true } }),
    db.collection('media').countDocuments({ userId, 'userConfirmedPeople.0': { $exists: true } }),
    db.collection('magic_library_activation').countDocuments({ userId, 'active.0': { $exists: true } }),
    db.collection('magic_library_activation').countDocuments({ userId, 'recognitionFavorites.0': { $exists: true } }),
    db.collection('upload_reservations').countDocuments({ userId, 'assignedPeople.0': { $exists: true } }),
  ]);

  const checks = {
    face_index: faceIndex,
    favorite_people_recognition: favoritePeopleRecognition,
    person_clusters: personClusters,
    'media.peopleIntelligence': mediaPeopleIntelligence,
    'media.userConfirmedPeople': mediaConfirmedPeople,
    'magic_library_activation.active': activeFaces,
    'magic_library_activation.recognitionFavorites': recognitionFavorites,
    'upload_reservations.assignedPeople': reservationPeople,
  };
  const remaining = Object.entries(checks).filter(([, count]) => Number(count || 0) > 0);
  return { ok: remaining.length === 0, checks, remaining };
}
