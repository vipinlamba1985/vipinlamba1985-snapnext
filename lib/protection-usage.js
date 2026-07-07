export function supportedProtectionMime(mime = '') {
  return mime.startsWith('image/') || mime.startsWith('video/');
}

export async function getProtectedBytes(db, userId) {
  const rows = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' } } },
  ]).toArray();
  return rows[0]?.bytes || 0;
}

export async function findProtectedDuplicate(db, userId, hash) {
  if (!hash) return null;
  return db.collection('media').findOne({ userId, hash }, { projection: { id: 1, name: 1 } });
}
