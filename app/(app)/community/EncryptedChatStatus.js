'use client';

import { KeyRound, Loader2, LockKeyhole, ShieldAlert } from 'lucide-react';

const styles = {
  protected: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
  waiting: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
  'device-required': 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100',
  'rotation-required': 'border-purple-300/20 bg-purple-400/10 text-purple-100',
  disabled: 'border-white/10 bg-white/5 text-white/50',
};

export default function EncryptedChatStatus({ status, onSecureDevice, busy = false }) {
  const state = status?.state || 'disabled';
  const label = status?.label || 'Encryption not enabled';
  const Icon = state === 'protected'
    ? LockKeyhole
    : state === 'device-required'
      ? KeyRound
      : state === 'rotation-required'
        ? Loader2
        : ShieldAlert;

  return (
    <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-xs ${styles[state] || styles.disabled}`}>
      <div className="flex items-center gap-2 font-bold">
        <Icon className={`h-4 w-4 ${state === 'rotation-required' ? 'animate-spin' : ''}`} />
        <span>{label}</span>
      </div>
      {state === 'device-required' && onSecureDevice && (
        <button
          type="button"
          onClick={onSecureDevice}
          disabled={busy}
          className="rounded-full bg-white px-3 py-1.5 font-black text-black disabled:opacity-50"
        >
          {busy ? 'Securing…' : 'Secure this device'}
        </button>
      )}
      {state === 'protected' && <span className="text-[10px] opacity-75">Only approved member devices can decrypt new messages.</span>}
    </div>
  );
}
