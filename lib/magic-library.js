export const MAGIC_PEOPLE_LIMITS = Object.freeze({
  free: 4,
  starter: 10,
  plus: 30,
  pro: 100,
  family: 500,
  super_user: 500,
});

export function magicPeopleLimitForPlan(planId) {
  return MAGIC_PEOPLE_LIMITS[planId] || MAGIC_PEOPLE_LIMITS.free;
}

export function normalizeMagicPeople(values = []) {
  return Array.from(new Set(
    values
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  ));
}
