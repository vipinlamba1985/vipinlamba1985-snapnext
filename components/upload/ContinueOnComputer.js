'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Laptop, Loader2, ShieldCheck, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

function timeLabel(expiresAt, now) {
  if (!expiresAt) return '';
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default function ContinueOnComputer() {
  const [handoff, setHandoff] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const state = handoff?.session;
  const active = state && ['pending', 'claimed', 'approved'].includes(state.status);
  const remaining = useMemo(() => timeLabel(state?.expiresAt, now), [state?.expiresAt, now]);

  useEffect(() => {
    if (!state?.expiresAt || !active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state?.expiresAt, active]);

  useEffect(() => {
    if (!state?.id || !active) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await apiFetch(`/computer-handoff?id=${encodeURIComponent(state.id)}`);
        if (!cancelled && data?.session) {
          setHandoff((current) => current ? { ...current, session: data.session } : current);
        }
      } catch {
        // Pairing remains short-lived. A transient status poll must not interrupt backup.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state?.id, active]);

  async function startPairing() {
    setBusy('create');
    setError('');
    try {
      const data = await apiFetch('/computer-handoff', {
        method: 'POST',
        body: JSON.stringify({ action: 'create' }),
      });
      if (!data?.session?.id || !data?.creatorSecret) throw new Error('Computer pairing is unavailable in this session.');
      setHandoff(data);
      setNow(Date.now());
    } catch (nextError) {
      setError(nextError?.message || 'Could not start computer pairing.');
    } finally {
      setBusy('');
    }
  }

  async function approveComputer() {
    if (!state?.id || !handoff?.creatorSecret) return;
    setBusy('approve');
    setError('');
    try {
      const data = await apiFetch('/computer-handoff', {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          id: state.id,
          creatorSecret: handoff.creatorSecret,
        }),
      });
      if (data?.session) setHandoff((current) => ({ ...current, session: data.session }));
    } catch (nextError) {
      setError(nextError?.message || 'Could not approve this computer.');
    } finally {
      setBusy('');
    }
  }

  async function cancelPairing() {
    if (!state?.id || !handoff?.creatorSecret) {
      setHandoff(null);
      return;
    }
    setBusy('cancel');
    try {
      const data = await apiFetch('/computer-handoff', {
        method: 'POST',
        body: JSON.stringify({
          action: 'cancel',
          id: state.id,
          creatorSecret: handoff.creatorSecret,
        }),
      });
      setHandoff((current) => current ? { ...current, session: data?.session || current.session } : current);
    } catch {
      setHandoff(null);
    } finally {
      setBusy('');
    }
  }

  async function copyPairCode() {
    if (!state?.pairCode || !navigator?.clipboard) return;
    await navigator.clipboard.writeText(state.pairCode).catch(() => null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!handoff) {
    return (
      <div data-testid="continue-on-computer" className="mx-auto mb-4 max-w-5xl px-1 md:hidden">
        <button
          type="button"
          onClick={() => void startPairing()}
          disabled={busy === 'create'}
          className="flex w-full items-center gap-3 rounded-2xl border border-sky-300/20 bg-sky-400/[0.08] px-4 py-4 text-left disabled:opacity-50"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-300/10 text-sky-100">
            {busy === 'create' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Laptop className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-white">Continue on computer</span>
            <span className="mt-1 block text-xs leading-5 text-white/50">Best for a large first backup. Pair securely for 5 minutes, then choose files on the computer.</span>
          </span>
        </button>
        {error && <p className="mt-2 px-2 text-xs text-rose-200">{error}</p>}
      </div>
    );
  }

  const done = state?.status === 'consumed';
  const stopped = ['cancelled', 'expired'].includes(state?.status);

  return (
    <div data-testid="computer-handoff-panel" className="mx-auto mb-4 max-w-5xl px-1 md:hidden">
      <section className="rounded-3xl border border-sky-300/20 bg-[#0b1320] p-5 shadow-xl shadow-black/20">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-300/10 text-sky-100">
            {done ? <CheckCircle2 className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-white">Continue on computer</div>
            {!done && !stopped && <div className="mt-1 text-xs text-white/45">Pairing expires in {remaining || '5:00'}.</div>}
          </div>
          {!done && (
            <button type="button" onClick={() => void cancelPairing()} disabled={busy === 'cancel'} className="rounded-full p-2 text-white/40 hover:bg-white/5 hover:text-white" aria-label="Cancel pairing">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!done && !stopped && (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">On your computer</div>
              <div className="mt-2 text-sm font-bold text-sky-100">Open snapnext.ai/connect</div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-4 py-3">
                <span className="font-mono text-xl font-black tracking-[0.14em] text-white">{state?.pairCode}</span>
                <button type="button" onClick={() => void copyPairCode()} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/70">
                  <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {state?.status === 'pending' && (
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/55">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-200" /> Waiting for your computer to enter the pairing code.
              </div>
            )}

            {state?.status === 'claimed' && (
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
                  <div>
                    <div className="text-sm font-black text-emerald-50">Confirm the same code on both screens</div>
                    <div data-testid="handoff-verification-code" className="mt-3 font-mono text-3xl font-black tracking-[0.16em] text-white">{state?.verificationCode}</div>
                    <p className="mt-2 text-xs leading-5 text-emerald-50/60">If the computer shows this exact code, approve it. If not, cancel.</p>
                  </div>
                </div>
                <button type="button" onClick={() => void approveComputer()} disabled={busy === 'approve'} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-black text-emerald-950 disabled:opacity-50">
                  {busy === 'approve' && <Loader2 className="h-4 w-4 animate-spin" />} Codes match — approve computer
                </button>
              </div>
            )}

            {state?.status === 'approved' && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-sm leading-6 text-emerald-50/70">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /> Approved. The computer is opening SnapNext Add now.
              </div>
            )}

            <p className="text-xs leading-5 text-white/35">No photos pass through this phone. The computer uploads directly to your signed-in SnapNext account.</p>
          </div>
        )}

        {done && (
          <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-sm leading-6 text-emerald-50/75">
            Computer connected. Continue the large backup there; this phone can be used normally.
          </div>
        )}

        {stopped && (
          <div className="mt-5">
            <p className="text-sm text-white/55">This pairing {state?.status === 'expired' ? 'expired' : 'was cancelled'}. No computer access was granted.</p>
            <button type="button" onClick={() => setHandoff(null)} className="mt-3 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-white">Start again</button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-rose-200">{error}</p>}
      </section>
    </div>
  );
}
