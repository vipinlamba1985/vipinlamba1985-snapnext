function count(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

export function historicalPersonMediaIds(person = {}) {
  return uniqueStrings([
    ...(Array.isArray(person.mediaIds) ? person.mediaIds : []),
    person.representativeMediaId,
  ]);
}

export function supportsHistoricalPersonFallback(person = {}) {
  return Boolean(person.isSelf || person.restoredAt);
}

export function shouldUseHistoricalPersonFallback(person = {}, liveCount = 0) {
  return supportsHistoricalPersonFallback(person)
    && count(liveCount) === 0
    && historicalPersonMediaIds(person).length > 0;
}

export function choosePersonCounts(person = {}, live = {}, historical = null) {
  const liveCounts = {
    count: count(live.count),
    photos: count(live.photos),
    videos: count(live.videos),
  };
  const historicalCounts = historical ? {
    count: count(historical.count),
    photos: count(historical.photos),
    videos: count(historical.videos),
  } : null;

  if (!shouldUseHistoricalPersonFallback(person, liveCounts.count) || !historicalCounts?.count) {
    return {
      ...liveCounts,
      source: 'live_cluster_membership',
      reconciled: false,
    };
  }

  return {
    ...historicalCounts,
    source: 'restored_media_history',
    reconciled: true,
  };
}
