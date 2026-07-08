import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { analyzeImage } from '@/lib/gemini';

export const runtime = 'nodejs';

const BATCH_SIZE = 8;
const MAX_ANALYSIS_BYTES = 20 * 1024 * 1024;

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const items = await db.collection('media').find({
    userId: user.id,
    trashed: { $ne: true },
    kind: 'photo',
    userCategory: { $exists: false },
    $or: [
      { 'aiAnalysis.contentType': { $exists: false } },
      { 'aiAnalysis.contentTypeConfidence': { $lt: 0.6 } },
    ],
  }).sort({ createdAt: -1 }).limit(BATCH_SIZE).toArray();

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      if (!item.storageKey || Number(item.size || 0) > MAX_ANALYSIS_BYTES) {
        skipped += 1;
        continue;
      }
      const buffer = await storage.read({ provider: item.provider || 'local', storageKey: item.storageKey });
      const analysis = await analyzeImage({ buffer, mimeType: item.mime || 'image/jpeg' });
      if (!analysis || analysis.unavailable || !analysis.contentType) {
        skipped += 1;
        continue;
      }
      await db.collection('media').updateOne(
        { id: item.id, userId: user.id, userCategory: { $exists: false } },
        { $set: { aiAnalysis: { ...(item.aiAnalysis || {}), ...analysis }, classificationUpdatedAt: new Date() } },
      );
      updated += 1;
    } catch (error) {
      console.error('[media/reclassify] failed', item.id, error?.message);
      skipped += 1;
    }
  }

  const remaining = await db.collection('media').countDocuments({
    userId: user.id,
    trashed: { $ne: true },
    kind: 'photo',
    userCategory: { $exists: false },
    $or: [
      { 'aiAnalysis.contentType': { $exists: false } },
      { 'aiAnalysis.contentTypeConfidence': { $lt: 0.6 } },
    ],
  });

  return NextResponse.json({ ok: true, processed: items.length, updated, skipped, remaining });
}
