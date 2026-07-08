'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

export default function LockedPersonPrompt({ person, onClose }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    apiFetch('/magic-library/activation')
      .then((result) => { if (!cancelled) setState(result); })
      .catch(() => { if (!cancelled) setState({ limit: 4, active: [], enabled: [] }); });
    return () => { cancelled = true; };
  }, [person?.name]);

  if (!person) return null;

  const active = state?.active || [];
  const limit = Number(state?.limit || 4);
  const slotsLeft = Math.max(0, limit - active.length);
  const canActivate = slotsLeft > 0;

  async function activate() {
    setBusy(true);
    try {
      await apiFetch('/magic-library/activation', {
        method: 'POST',
        body: JSON.stringify({ people: [...active, person.name] }),
      });
      toast.success('Person activated');
      onClose?.();
      window.location.reload();
    } catch (error) {
      toast.error(error?.message || 'Could not activate this person');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0414] p-6" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-white/50"><X className="h-5 w-5" /></button>
        <Sparkles className="h-8 w-8 text-pink-300" />
        <h2 className="mt-4 text-2xl font-black text-white">SnapNext found this person</h2>
        <p className="mt-3 text-sm leading-6 text-white/55">Approximately {person.count || person.photos || 0} memories are linked to this discovered person.</p>

        {canActivate ? (
          <>
            <p className="mt-3 text-sm leading-6 text-white/55">You have {slotsLeft} active {slotsLeft === 1 ? 'person slot' : 'people slots'} left. Activate this person to unlock one-tap search and all related memories.</p>
            <button onClick={activate} disabled={busy || !state} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white disabled:opacity-45">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Activating…' : 'Activate Person'}</button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-white/55">Your plan already has {active.length} of {limit} active people. All discovered people stay visible, but full person search needs an active slot.</p>
            <Link href="/billing" className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white">Unlock More Active People</Link>
          </>
        )}
      </div>
    </div>
  );
}
