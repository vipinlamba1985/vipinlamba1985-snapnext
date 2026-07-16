import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function validPublicJwk(jwk) {
  return Boolean(jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && jwk.x && jwk.y && !jwk.d);
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const devices = await db.collection('chat_e2ee_devices')
    .find({ userId: user.id, revokedAt: null })
    .project({ _id: 0 })
    .sort({ createdAt: -1 })
    .toArray();
  return json({ devices });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = await request.json().catch(() => ({}));
  if (!validPublicJwk(body.publicJwk)) return json({ error: 'A valid P-256 public key is required.' }, 400);
  const db = await getDb();
  const deviceId = String(body.deviceId || uuidv4()).slice(0, 120);
  const now = new Date();
  await db.collection('chat_e2ee_devices').updateOne(
    { userId: user.id, deviceId },
    {
      $set: {
        userId: user.id,
        deviceId,
        deviceName: String(body.deviceName || 'SnapNext device').slice(0, 120),
        platform: String(body.platform || 'web').slice(0, 40),
        publicJwk: body.publicJwk,
        algorithm: 'ECDH-P256',
        lastSeenAt: now,
        revokedAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return json({ deviceId, registered: true }, 201);
}
