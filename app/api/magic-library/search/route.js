import { NextResponse } from 'next/server';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { listUserMedia, cleanMediaDocument } from '@/lib/media-library-service';
import { listDeterministicCollection } from '@/lib/magic-manifest.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function listCaptureRange({ db, userId, start, end, limit = 120 }) {
  const rows = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true }, kind: { $in: ['photo', 'video'] } } },
    {
      $addFields: {
        __captureAt: {
          $ifNull: ['$capturedAt', { $ifNull: ['$takenAt', '$mediaCreatedAt'] }],
        },
      },
    },
    { $match: { __captureAt: { $gte: start, $lt: end } } },
    { $sort: { __captureAt: -1, id: 1 } },
    { $limit: Math.max(1, Math.min(500, Number(limit) || 120)) },
  ]).toArray();
  return rows.map(row => {
    const { __captureAt, ...clean } = cleanMediaDocument(row);
    return clean;
  });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const preset = String(url.searchParams.get('preset') || '').trim().toLowerCase();
  const query = String(url.searchParams.get('q') || '').trim();
  const db = await getDb();

  let items = [];
  let label = query;
  if (preset === 'videos') {
    items = await listDeterministicCollection({ db, userId: user.id, type: 'videos', limit: 120 });
    label = 'Videos';
  } else if (preset === '2024') {
    items = await listCaptureRange({
      db,
      userId: user.id,
      start: new Date('2024-01-01T00:00:00.000Z'),
      end: new Date('2025-01-01T00:00:00.000Z'),
    });
    label = '2024';
  } else if (preset === 'last-summer') {
    const now = new Date();
    const year = now.getUTCFullYear() - 1;
    items = await listCaptureRange({
      db,
      userId: user.id,
      start: new Date(Date.UTC(year, 5, 1)),
      end: new Date(Date.UTC(year, 8, 1)),
    });
    label = 'Last summer';
  } else if (query) {
    items = await listUserMedia({ db, userId: user.id, query, limit: 120 });
  }

  const response = NextResponse.json({ ok: true, query: label, preset: preset || null, count: items.length, items });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
