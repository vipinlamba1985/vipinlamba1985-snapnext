export const EXTERNAL_EXPORT_DELETION_NOTICE = 'Copies saved or shared outside SnapNext are controlled by the destination and cannot be deleted by SnapNext.';

export const CREATE_PLAN_INCLUDED_COPY = 'Included with your plan';

export function canonicalRenderUsageCopy({ used = 0, limit = 0 } = {}) {
  const safeUsed = Math.max(0, Math.floor(Number(used) || 0));
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  return `${safeUsed} of ${safeLimit} Reel export${safeLimit === 1 ? '' : 's'} used this month`;
}

export function exportedCopyIsSnapNextControlled({ destination = 'snapnext' } = {}) {
  return String(destination || '').toLowerCase() === 'snapnext';
}
