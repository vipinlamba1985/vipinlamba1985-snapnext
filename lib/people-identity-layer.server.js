import { peopleRekognition } from '@/lib/people-rekognition-capabilities.server';

function safeUserId(clusterId) {
  return `person_${String(clusterId || '').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 110)}`;
}

function isPermissionError(error) {
  return error?.name === 'AccessDeniedException' || /not authorized|no identity-based policy allows/i.test(String(error?.message || ''));
}

export async function syncClusterUserVector({ collectionId, clusterId, faceIds = [], threshold = 92 }) {
  const uniqueFaceIds = Array.from(new Set(faceIds.filter(Boolean))).slice(0, 100);
  if (uniqueFaceIds.length < 2) {
    return { status: 'waiting_for_more_evidence', userId: null, associated: 0 };
  }

  const userId = safeUserId(clusterId);
  try {
    try {
      await peopleRekognition.createUser({ CollectionId: collectionId, UserId: userId });
    } catch (error) {
      if (error?.name !== 'ConflictException') throw error;
    }

    const result = await peopleRekognition.associateFaces({
      CollectionId: collectionId,
      UserId: userId,
      FaceIds: uniqueFaceIds,
      UserMatchThreshold: threshold,
    });

    return {
      status: 'active',
      userId,
      associated: result.AssociatedFaces?.length || 0,
      rejected: result.UnsuccessfulFaceAssociations?.length || 0,
      userStatus: result.UserStatus || null,
    };
  } catch (error) {
    if (isPermissionError(error)) {
      return { status: 'permission_not_enabled', userId, associated: 0, missingAction: error?.message?.match(/rekognition:([A-Za-z]+)/)?.[1] || null };
    }
    throw error;
  }
}

export async function searchIdentityByFace({ collectionId, faceId, threshold = 92 }) {
  try {
    const result = await peopleRekognition.searchUsers({
      CollectionId: collectionId,
      FaceId: faceId,
      MaxUsers: 10,
      UserMatchThreshold: threshold,
    });
    return { status: 'ok', matches: result.UserMatches || [] };
  } catch (error) {
    if (isPermissionError(error)) return { status: 'permission_not_enabled', matches: [] };
    throw error;
  }
}

export async function removeClusterUserVector({ collectionId, clusterId }) {
  const userId = safeUserId(clusterId);
  try {
    await peopleRekognition.deleteUser({ CollectionId: collectionId, UserId: userId });
    return { status: 'deleted', userId };
  } catch (error) {
    if (error?.name === 'ResourceNotFoundException') return { status: 'already_absent', userId };
    if (isPermissionError(error)) return { status: 'permission_not_enabled', userId };
    throw error;
  }
}
