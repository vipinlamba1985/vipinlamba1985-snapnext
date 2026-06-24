import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024**4) return (bytes/1024**4).toFixed(2)+' TB';
  if (bytes >= 1024**3) return (bytes/1024**3).toFixed(2)+' GB';
  if (bytes >= 1024**2) return (bytes/1024**2).toFixed(2)+' MB';
  if (bytes >= 1024) return (bytes/1024).toFixed(0)+' KB';
  return bytes + ' B';
}
