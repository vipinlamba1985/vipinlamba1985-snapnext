export const FACE_MATCH_THRESHOLD = 92;
export const FACE_AUTO_ASSIGN_THRESHOLD = 98;

export function rekognitionUserId(clusterId) {
  return `person_${String(clusterId || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120)}`;
}

export function matchDecision(similarity, { suggest = FACE_MATCH_THRESHOLD, auto = FACE_AUTO_ASSIGN_THRESHOLD } = {}) {
  const score = Number(similarity || 0);
  if (score >= auto) return 'confirmed';
  if (score >= suggest) return 'suggested';
  return 'unmatched';
}
