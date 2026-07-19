export const PEOPLE_REKOGNITION_ACTIONS = [
  'CreateCollection',
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
  const identityCalls = Math.max(0, Number(estimatedFaces || 0)) * 2;
  return Number(((indexCalls + identityCalls) * PEOPLE_COST_POLICY.estimatedPaidUsdPerCall).toFixed(6));
}

export function peopleCapabilitySummary() {
  return {
    actionCount: PEOPLE_REKOGNITION_ACTIONS.length,
    actions: PEOPLE_REKOGNITION_ACTIONS,
    policy: PEOPLE_COST_POLICY,
    executionRule: 'Index each eligible photo once, search each returned face against private user vectors, cache permanently, and never analyze video automatically.',
  };
}
