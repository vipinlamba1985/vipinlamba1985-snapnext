'use client';

const DB_NAME = 'snapnext-e2ee';
const DB_VERSION = 1;
const STORE = 'vault';
const VAULT_KEY_ID = 'vault-key-v1';
const DEVICE_PREFIX = 'device:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function openVaultDb() {
  if (typeof indexedDB === 'undefined') throw new Error('Encrypted chat storage is not supported on this device.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Encrypted key storage could not be opened.'));
  });
}

async function getRecord(id) {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Encrypted key storage could not be read.'));
    tx.oncomplete = () => db.close();
  });
}

async function putRecord(record) {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve(record); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Encrypted key storage could not be updated.')); };
  });
}

async function removeRecord(id) {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Encrypted key storage could not be cleared.')); };
  });
}

async function getOrCreateVaultKey() {
  const existing = await getRecord(VAULT_KEY_ID);
  if (existing?.key) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await putRecord({ id: VAULT_KEY_ID, key, createdAt: new Date().toISOString() });
  return key;
}

function deviceRecordId(userId, deviceId) {
  if (!userId || !deviceId) throw new Error('User and device identity are required.');
  return `${DEVICE_PREFIX}${userId}:${deviceId}`;
}

export async function storeEncryptedDeviceIdentity({ userId, deviceId, publicJwk, privateJwk, label }) {
  const vaultKey = await getOrCreateVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`snapnext:e2ee-device:${userId}:${deviceId}`);
  const plaintext = encoder.encode(JSON.stringify(privateJwk));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, vaultKey, plaintext);
  const record = {
    id: deviceRecordId(userId, deviceId),
    userId,
    deviceId,
    label: String(label || 'This device').slice(0, 80),
    publicJwk,
    encryptedPrivateJwk: ciphertext,
    iv,
    createdAt: new Date().toISOString(),
    version: 1,
  };
  await putRecord(record);
  return { userId, deviceId, label: record.label, publicJwk, createdAt: record.createdAt };
}

export async function loadEncryptedDeviceIdentity({ userId, deviceId }) {
  const record = await getRecord(deviceRecordId(userId, deviceId));
  if (!record) return null;
  const vaultKeyRecord = await getRecord(VAULT_KEY_ID);
  if (!vaultKeyRecord?.key) throw new Error('This device encryption vault is unavailable. Restore or reset encrypted chat.');
  const aad = encoder.encode(`snapnext:e2ee-device:${userId}:${deviceId}`);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv, additionalData: aad },
    vaultKeyRecord.key,
    record.encryptedPrivateJwk,
  );
  return {
    userId,
    deviceId,
    label: record.label,
    publicJwk: record.publicJwk,
    privateJwk: JSON.parse(decoder.decode(plaintext)),
    createdAt: record.createdAt,
  };
}

export async function removeEncryptedDeviceIdentity({ userId, deviceId }) {
  await removeRecord(deviceRecordId(userId, deviceId));
}

export async function encryptedDeviceIdentityExists({ userId, deviceId }) {
  return Boolean(await getRecord(deviceRecordId(userId, deviceId)));
}

export async function resetEncryptedChatVault() {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Encrypted chat vault could not be reset.')); };
  });
}
