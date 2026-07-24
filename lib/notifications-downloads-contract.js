import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(160);
const idListSchema = z.array(idSchema).max(200);

export class ActivityApiError extends Error {
  constructor(message, status = 400, code = 'activity_request_invalid') {
    super(message);
    this.name = 'ActivityApiError';
    this.status = status;
    this.code = code;
  }
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function parseNotificationReadRequest(body = {}) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ActivityApiError('Invalid notification request.', 400, 'notifications_request_invalid');
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'ids')) return { ids: null };
  const parsed = idListSchema.safeParse(body.ids);
  if (!parsed.success) {
    throw new ActivityApiError('Invalid notification IDs.', 400, 'notifications_ids_invalid');
  }
  return { ids: unique(parsed.data) };
}

export function parseDownloadLogRequest(body = {}) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ActivityApiError('Invalid download request.', 400, 'downloads_request_invalid');
  }
  const parsed = idListSchema.safeParse(body.mediaIds);
  if (!parsed.success || parsed.data.length === 0) {
    throw new ActivityApiError('Choose at least one media item.', 400, 'downloads_media_required');
  }
  return { mediaIds: unique(parsed.data) };
}
