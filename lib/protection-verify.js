import { storage } from '@/lib/storage';

export async function verifyProtectedObject({ provider, storageKey, expectedBytes }) {
  if (provider !== 's3') return { ok: true, size: expectedBytes };
  const signed = await storage.getReadUrl({ provider: 's3', storageKey, expiresSec: 60 });
  if (!signed) throw new Error('Could not verify uploaded object');
  const response = await fetch(signed, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
  if (!response.ok) throw new Error('Uploaded object is not available');
  const contentRange = response.headers.get('content-range') || '';
  const match = contentRange.match(/\/(\d+)$/);
  const size = match ? Number(match[1]) : Number(response.headers.get('content-length') || 0);
  if (expectedBytes && size && size !== expectedBytes) throw new Error('Uploaded object size does not match the protected file');
  return { ok: true, size: size || expectedBytes };
}
