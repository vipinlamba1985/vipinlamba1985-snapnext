import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function keyMaterial() {
  const raw = String(process.env.CIRCLES_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('CIRCLES_TOKEN_ENCRYPTION_KEY is required for connected social accounts.');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value) {
  if (!value) return null;
  const [ivPart, tagPart, payloadPart] = String(value).split('.');
  if (!ivPart || !tagPart || !payloadPart) throw new Error('Invalid encrypted token payload.');
  const decipher = crypto.createDecipheriv(ALGORITHM, keyMaterial(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payloadPart, 'base64url')), decipher.final()]);
  return decrypted.toString('utf8');
}
