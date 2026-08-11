import { peopleCollectionId } from '@/lib/people-intelligence';
import { favoritePeopleCollectionId } from '@/lib/favorite-people';
import { peopleRekognition } from '@/lib/people-rekognition-capabilities.server';
import {
  deleteSnapNextFaceRecognitionState,
  verifySnapNextFaceRecognitionStateDeleted,
} from '@/lib/face-deletion-inventory';

function isMissingResource(error) {
  return error?.name === 'ResourceNotFoundException'
    || error?.Code === 'ResourceNotFoundException'
    || /collection.*not.*exist|resource.*not.*found/i.test(String(error?.message || ''));
}

async function cloudRecognitionEvidence(db, userId) {
  const [legacyFaces, favoriteEnrollments, rekognitionPeople] = await Promise.all([
    db.collection('face_index').countDocuments({ userId }),
    db.collection('favorite_people_recognition').countDocuments({ userId }),
    db.collection('person_clusters').countDocuments({ userId, rekognitionUserId: { $exists: true, $ne: null } }),
  ]);
  return Number(legacyFaces || 0) + Number(favoriteEnrollments || 0) + Number(rekognitionPeople || 0);
}

async function deleteAndVerifyCollection(collectionId) {
  try {
    await peopleRekognition.deleteCollection({ CollectionId: collectionId });
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }

  try {
    await peopleRekognition.describeCollection({ CollectionId: collectionId });
  } catch (error) {
    if (isMissingResource(error)) return { collectionId, verifiedAbsent: true };
    throw error;
  }

  const error = new Error('Cloud face-recognition data still exists. Account deletion cannot complete yet.');
  error.code = 'account_face_deletion_verification_failed';
  throw error;
}

export async function purgeFaceRecognitionBeforeAccountDeletion({ db, userId }) {
  if (!db || !userId) throw new Error('Database and user id are required for face-state deletion.');

  const evidence = await cloudRecognitionEvidence(db, userId);
  const collections = [];
  if (evidence > 0) {
    for (const collectionId of [peopleCollectionId(userId), favoritePeopleCollectionId(userId)]) {
      collections.push(await deleteAndVerifyCollection(collectionId));
    }
  }

  await deleteSnapNextFaceRecognitionState({ db, userId });
  const snapNext = await verifySnapNextFaceRecognitionStateDeleted({ db, userId });
  if (!snapNext.ok) {
    const error = new Error('SnapNext face-recognition records could not be fully deleted. Please retry account deletion.');
    error.code = 'account_face_records_deletion_incomplete';
    error.remaining = snapNext.remaining;
    throw error;
  }

  return { cloudEvidence: evidence, collections, snapNext };
}
