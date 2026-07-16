import crypto from 'crypto';

function key() {
  return crypto.createHash('sha256').update(process.env.CLOUD_CONNECTOR_SECRET || '').digest();
}

export function decryptCloudToken(value) {
  const [iv, tag, data] = String(value || '').split('.');
  if (!iv || !tag || !data) throw new Error('Cloud connection token is unavailable.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
