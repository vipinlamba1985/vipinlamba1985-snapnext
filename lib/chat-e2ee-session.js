'use client';

import { apiFetch } from '@/lib/api-client';
import { generateDeviceKeyPair } from '@/lib/chat-e2ee-client';
import {
  encryptedDeviceIdentityExists,
  loadEncryptedDeviceIdentity,
  removeEncryptedDeviceIdentity,
  storeEncryptedDeviceIdentity,
} from '@/lib/chat-e2ee-key-vault';

const DEVICE_ID_KEY = 'snapnext:e2ee:device-id:v1';

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateLocalDeviceId() {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = randomId();
  window.localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

export function describeCurrentDevice() {
  if (typeof navigator === 'undefined') return 'Web browser';
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Web';
  return `${platform} browser`.slice(0, 80);
}

export async function ensureEncryptedChatDevice({ userId }) {
  if (!userId) throw new Error('A signed-in user is required.');
  const deviceId = getOrCreateLocalDeviceId();
  const exists = await encryptedDeviceIdentityExists({ userId, deviceId });
  let identity = exists ? await loadEncryptedDeviceIdentity({ userId, deviceId }) : null;

  if (!identity) {
    const keyPair = await generateDeviceKeyPair();
    identity = await storeEncryptedDeviceIdentity({
      userId,
      deviceId,
      publicJwk: keyPair.publicJwk,
      privateJwk: keyPair.privateJwk,
      label: describeCurrentDevice(),
    });
  }

  await apiFetch('/chat-e2ee/devices', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      deviceName: identity.label || describeCurrentDevice(),
      platform: 'web',
      publicJwk: identity.publicJwk,
    }),
  });

  return loadEncryptedDeviceIdentity({ userId, deviceId });
}

export async function getEncryptedChatDevice({ userId }) {
  if (!userId) return null;
  const deviceId = getOrCreateLocalDeviceId();
  return loadEncryptedDeviceIdentity({ userId, deviceId });
}

export async function removeLocalEncryptedChatDevice({ userId }) {
  const deviceId = getOrCreateLocalDeviceId();
  await removeEncryptedDeviceIdentity({ userId, deviceId });
  return deviceId;
}

export async function listRegisteredEncryptedChatDevices() {
  const data = await apiFetch('/chat-e2ee/devices');
  return data.devices || [];
}

export function encryptionReadinessLabel({ enabled, deviceReady, threadReady, needsRotation }) {
  if (!enabled) return { state: 'disabled', label: 'Encryption not enabled' };
  if (!deviceReady) return { state: 'device-required', label: 'Secure this device' };
  if (needsRotation) return { state: 'rotation-required', label: 'Refreshing encryption keys' };
  if (!threadReady) return { state: 'waiting', label: 'Waiting for every member device' };
  return { state: 'protected', label: 'End-to-end encrypted' };
}
