export const PEOPLE_REKOGNITION_ACTIONS = [
  'CreateCollection',
  'DescribeCollection',
  'IndexFaces',
  'SearchFaces',
  'CreateUser',
  'AssociateFaces',
  'SearchUsers',
  'DisassociateFaces',
  'DeleteUser',
  'DeleteFaces',
  'DeleteCollection',
];

export const PEOPLE_COST_POLICY = {
  estimatedPaidUsdPerCall: Number(process.env.PEOPLE_EST_PAID_USD_PER_CALL || 0.001),
  maxEstimatedUsdPerBatch: Number(process.env.PEOPLE_MAX_EST_USD_PER_BATCH || 0.10),
  maxPhotosPerBatch: Number(process.env.PEOPLE_MAX_PHOTOS_PER_BATCH || 12),
  videoEnabled: false,
};

export function estimatePhotoRunCost({ photos = 0, estimatedFaces = 0 } = {}) {
  const indexCalls = Math.max(0, Number(photos || 0));
  const searchCalls = Math.max(0, Number(estimatedFaces || 0));
  const cleanupCalls = Math.max(0, Number(photos || 0));
  return Number(((indexCalls + searchCalls + cleanupCalls) * PEOPLE_COST_POLICY.estimatedPaidUsdPerCall).toFixed(6));
}

export function peopleCapabilitySummary() {
  return {
    actionCount: PEOPLE_REKOGNITION_ACTIONS.length,
    actions: PEOPLE_REKOGNITION_ACTIONS,
    policy: PEOPLE_COST_POLICY,
    executionRule: 'Retain only explicit Favourite People enrolment references. For each locally eligible ordinary photo, temporarily index faces, search only the Favourite-only user collection, discard unmatched identities, delete every temporary face vector, cache the local match, and never analyze video automatically.',
  };
}
