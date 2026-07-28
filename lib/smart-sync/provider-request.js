const ALLOWED_CONNECTION_TYPES = new Set([
  'cloud_service',
  'webdav',
  's3_compatible',
  'nas',
  'other',
]);

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function providerKey(name) {
  return cleanText(name, 80)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeSmartSyncProviderRequest(body = {}) {
  const providerName = cleanText(body.providerName, 80);
  const connectionType = ALLOWED_CONNECTION_TYPES.has(body.connectionType)
    ? body.connectionType
    : 'cloud_service';
  const details = cleanText(body.details, 400);
  const key = providerKey(providerName);

  if (providerName.length < 2 || !key) {
    const error = new Error('Enter the cloud or storage provider you want SnapNext to support.');
    error.code = 'provider_required';
    throw error;
  }

  return {
    providerKey: key,
    providerName,
    connectionType,
    details,
  };
}

export function upsertProviderRequest(existing = [], request, now = new Date()) {
  const rows = Array.isArray(existing) ? existing.filter(Boolean) : [];
  const index = rows.findIndex(item => item.providerKey === request.providerKey);
  const previous = index >= 0 ? rows[index] : null;
  const next = {
    ...request,
    status: 'requested',
    firstRequestedAt: previous?.firstRequestedAt || now,
    lastRequestedAt: now,
    submitCount: Math.max(0, Number(previous?.submitCount || 0)) + 1,
  };

  const merged = index >= 0
    ? rows.map((item, itemIndex) => itemIndex === index ? next : item)
    : [next, ...rows];

  return merged
    .sort((a, b) => new Date(b.lastRequestedAt || 0) - new Date(a.lastRequestedAt || 0))
    .slice(0, 12);
}
