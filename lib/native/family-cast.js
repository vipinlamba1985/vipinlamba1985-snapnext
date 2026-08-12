'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeFamilyCast = registerPlugin('FamilyCast');
const SUPPORTED_NATIVE_PLATFORMS = new Set(['android', 'ios']);

function currentNativePlatform() {
  const platform = String(Capacitor.getPlatform?.() || '').toLowerCase();
  return Capacitor.isNativePlatform?.() && SUPPORTED_NATIVE_PLATFORMS.has(platform)
    ? platform
    : null;
}

function safeString(value, fallback = '') {
  return String(value || fallback).trim().slice(0, 240);
}

export async function nativeFamilyCastCapability() {
  const platform = currentNativePlatform();
  if (!platform) return { supported: false, reason: 'not_native_app' };
  try {
    const result = await NativeFamilyCast.getCapability();
    if (result?.supported !== true) {
      return {
        supported: false,
        platform,
        reason: safeString(result?.reason, 'native_cast_unavailable'),
      };
    }
    const reportedPlatform = safeString(result.platform, platform).toLowerCase();
    if (reportedPlatform !== platform) {
      return { supported: false, platform, reason: 'native_platform_mismatch' };
    }
    return {
      supported: true,
      platform,
      transport: safeString(result.transport, platform === 'android' ? 'google-cast' : 'airplay'),
      supportsPhotos: result.supportsPhotos === true,
      supportsVideos: result.supportsVideos !== false,
      fullStory: result.fullStory === true,
      frameworkVersion: safeString(result.frameworkVersion),
    };
  } catch {
    return { supported: false, platform, reason: 'native_plugin_missing' };
  }
}

export async function presentNativeFamilyCastPicker(options = {}) {
  return NativeFamilyCast.presentRoutePicker({ prefersVideo: options.prefersVideo !== false });
}

export async function nativeFamilyCastState() {
  const platform = currentNativePlatform();
  if (!platform) return { connected: false, platform: null, transport: null };
  try {
    const result = await NativeFamilyCast.getState();
    return {
      connected: result?.connected === true,
      platform,
      transport: safeString(result?.transport, platform === 'android' ? 'google-cast' : 'airplay'),
      deviceName: safeString(result?.deviceName),
      externalPlaybackActive: result?.externalPlaybackActive === true,
    };
  } catch {
    return { connected: false, platform, transport: platform === 'android' ? 'google-cast' : 'airplay' };
  }
}

export async function loadNativeFamilyCastMedia(item, { autoplay = true } = {}) {
  if (!item?.url || !item?.kind) throw new Error('Native cast media is incomplete.');
  return NativeFamilyCast.loadMedia({
    url: String(item.url),
    mime: safeString(item.mime, item.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    title: safeString(item.name, 'Family memory'),
    kind: String(item.kind),
    autoplay: Boolean(autoplay),
  });
}

export function playNativeFamilyCast() {
  return NativeFamilyCast.play();
}

export function pauseNativeFamilyCast() {
  return NativeFamilyCast.pause();
}

export function stopNativeFamilyCast() {
  return NativeFamilyCast.stop();
}

export function disconnectNativeFamilyCast() {
  return NativeFamilyCast.disconnect();
}

export async function addNativeFamilyCastEndedListener(listener) {
  if (typeof listener !== 'function') return null;
  try {
    return await NativeFamilyCast.addListener('ended', listener);
  } catch {
    return null;
  }
}
