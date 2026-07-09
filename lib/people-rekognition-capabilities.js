export const PEOPLE_REKOGNITION_ACTIONS = [
  'CreateCollection',
  'DescribeCollection',
  'DeleteCollection',
  'DetectFaces',
  'CompareFaces',
  'IndexFaces',
  'SearchFaces',
  'SearchFacesByImage',
  'ListFaces',
  'DeleteFaces',
  'CreateUser',
  'AssociateFaces',
  'DisassociateFaces',
  'SearchUsers',
  'SearchUsersByImage',
  'ListUsers',
  'DeleteUser',
  'StartFaceDetection',
  'GetFaceDetection',
  'StartFaceSearch',
  'GetFaceSearch',
];

export const PEOPLE_REKOGNITION_GROUPS = {
  collection: ['CreateCollection', 'DescribeCollection', 'DeleteCollection'],
  photoQuality: ['DetectFaces', 'CompareFaces'],
  faceIndex: ['IndexFaces', 'SearchFaces', 'SearchFacesByImage', 'ListFaces', 'DeleteFaces'],
  personIdentity: ['CreateUser', 'AssociateFaces', 'DisassociateFaces', 'SearchUsers', 'SearchUsersByImage', 'ListUsers', 'DeleteUser'],
  video: ['StartFaceDetection', 'GetFaceDetection', 'StartFaceSearch', 'GetFaceSearch'],
};

// Conservative planning rates for cost controls only, not billing records.
// AWS pricing is tiered and can change; actual invoices remain the source of truth.
export const PEOPLE_COST_POLICY = {
  estimatedGroup1UsdPerCall: Number(process.env.PEOPLE_EST_GROUP1_USD_PER_CALL || 0.001),
  estimatedGroup2UsdPerCall: Number(process.env.PEOPLE_EST_GROUP2_USD_PER_CALL || 0.001),
  estimatedVideoUsdPerMinute: Number(process.env.PEOPLE_EST_VIDEO_USD_PER_MIN || 0.10),
  maxEstimatedUsdPerPhotoRun: Number(process.env.PEOPLE_MAX_EST_USD_PER_PHOTO_RUN || 0.50),
  maxEstimatedUsdPerVideoRun: Number(process.env.PEOPLE_MAX_EST_USD_PER_VIDEO_RUN || 0.50),
  maxVideosPerRun: Number(process.env.PEOPLE_MAX_VIDEOS_PER_RUN || 1),
  videoEnabled: process.env.PEOPLE_VIDEO_FACE_SEARCH_ENABLED === 'true',
};

export function estimatePhotoRunCost({ indexCalls = 0, searchCalls = 0, detectCalls = 0, compareCalls = 0, userCalls = 0 } = {}) {
  const group1Calls = indexCalls + searchCalls + userCalls;
  const group2Calls = detectCalls + compareCalls;
  return Number((
    group1Calls * PEOPLE_COST_POLICY.estimatedGroup1UsdPerCall
    + group2Calls * PEOPLE_COST_POLICY.estimatedGroup2UsdPerCall
  ).toFixed(6));
}

export function estimateVideoRunCost(minutes = 0) {
  return Number((Math.max(0, Number(minutes || 0)) * PEOPLE_COST_POLICY.estimatedVideoUsdPerMinute).toFixed(6));
}

export function peopleCapabilitySummary() {
  return {
    actionCount: PEOPLE_REKOGNITION_ACTIONS.length,
    actions: PEOPLE_REKOGNITION_ACTIONS,
    groups: PEOPLE_REKOGNITION_GROUPS,
    policy: PEOPLE_COST_POLICY,
    executionRule: 'Capabilities are available, but only the cheapest useful subset runs for each memory.',
  };
}
