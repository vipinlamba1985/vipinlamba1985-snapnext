import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { entitlementForUser } from '@/lib/entitlements';

export const runtime = 'nodejs';

const MAX_EDIT_BYTES = 18 * 1024 * 1024;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const body = await request.json().catch(() => ({}));
  const { sourceMediaId, imageData, name, editHistory = [], recipe = 'Manual edit' } = body;
  if (!sourceMediaId || !String(imageData || '').startsWith('data:image/jpeg;base64,')) {
    return json({ error: 'We could not read this edited photo.' }, 400);
  }

  const buffer = Buffer.from(String(imageData).split(',')[1] || '', 'base64');
  if (!buffer.length || buffer.length > MAX_EDIT_BYTES) {
    return json({ error: 'This edited copy is too large to save. Try the share-ready size.' }, 413);
  }

  const db = await getDb();
  const source = await db.collection('media').findOne({ id: sourceMediaId, userId: user.id, trashed: { $ne: true } });
  if (!source) return json({ error: 'The original photo could not be found.' }, 404);

  const entitlement = entitlementForUser(user);
  const usage = await db.collection('media').aggregate([
    { $match: { userId: user.id, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' } } },
  ]).toArray();
  if (!entitlement.realIsSuper && entitlement.plan.storageBytes && (usage[0]?.bytes || 0) + buffer.length > entitlement.plan.storageBytes) {
    return json({ error: 'There is not enough storage space for this new copy.' }, 400);
  }

  const id = uuidv4();
  const safeName = String(name || `${source.name || 'photo'}-enhanced.jpg`).replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 120) || 'snapnext-enhanced.jpg';
  const saved = await storage.save({ userId: user.id, fileId: id, buffer, name: safeName, mime: 'image/jpeg' });
  const now = new Date();
  await db.collection('media').insertOne({
    id,
    userId: user.id,
    name: safeName,
    size: buffer.length,
    hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    mime: 'image/jpeg',
    kind: 'photo',
    storageKey: saved.storageKey,
    provider: saved.provider,
    favorite: false,
    trashed: false,
    derivedFrom: sourceMediaId,
    editHistory: Array.isArray(editHistory) ? editHistory.slice(-40) : [],
    enhancement: { recipe: String(recipe).slice(0, 80), createdAt: now, localProcessing: true },
    aiAnalysis: { tags: source.aiAnalysis?.tags || [], faces: [], autoAlbum: 'Enhanced Photos' },
    createdAt: now,
  });

  return json({ item: { id, name: safeName, size: buffer.length }, message: 'Your enhanced copy is saved in SnapNext.' });
}
