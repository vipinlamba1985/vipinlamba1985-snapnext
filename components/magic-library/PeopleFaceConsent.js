'use client';

import { useEffect, useState } from 'react';
import { Loader2, PauseCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { publishLibraryRefresh } from '@/lib/library-refresh';
import { toast } from 'sonner';

function publishConsentChanged(source) {
  publishLibraryRefresh({ source });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('snapnext:people-consent-changed'));
}

function RevokeButtons({ busy, confirmRevoke, setConfirmRevoke, revoke }) {
  if (!confirmRevoke) {
    return <button onClick={() => setConfirmRevoke(true)} disabled={busy} className="min-h-11 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-white/65 disabled:opacity-50">Turn off</button>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={revoke} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-500 px-4 text-xs font-black text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Turn off & queue deletion</button>
      <button onClick={() => setConfirmRevoke(false)} disabled={busy} className="min-h-11 rounded-full border border-white/10 px-4 text-xs font-black text-white/60">Cancel</button>
    </div>
  );
}

export default function PeopleFaceConsent() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  async function load() {
    const next = await apiFetch('/settings/face-processing-consent');
    setState(next);
  }

  useEffect(() => {
    load().catch(() => setState(null));
  }, []);

  async function grant() {
    setBusy(true);
    try {
      const next = await apiFetch('/settings/face-processing-consent', { method: 'POST' });
      setState(next);
      publishConsentChanged('face-processing-consent-granted');
      toast.success('People recognition enabled.');
    } catch (error) {
      toast.error(error?.message || 'People recognition could not be enabled.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const next = await apiFetch('/settings/face-processing-consent', { method: 'DELETE' });
      setState(next);
      setConfirmRevoke(false);
      publishConsentChanged('face-processing-consent-revoked');
      toast.success('People recognition is off. Face-data deletion is queued.');
    } catch (error) {
      toast.error(error?.message || 'People recognition could not be turned off.');
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  if (state.pendingDeletion) {
    return (
      <section data-testid="people-consent-pending-deletion" className="mb-5 rounded-3xl border border-amber-300/20 bg-amber-500/[0.08] p-5">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
          <div>
            <h2 className="font-black text-amber-50">People recognition is off</h2>
            <p className="mt-1 text-sm leading-6 text-amber-100/65">
              Face-data deletion is pending. SnapNext will not start new People recognition while this request is open. Existing face vectors may remain until the deletion worker removes them and verifies completion.
            </p>
            <p className="mt-2 text-xs font-bold text-amber-100/45">SnapNext will not label this data deleted until verification succeeds.</p>
          </div>
        </div>
      </section>
    );
  }

  // A rollout can be paused centrally without pretending an existing consent
  // disappeared. New users see no dormant feature; previously consented users
  // can still revoke and queue deletion while processing is paused.
  if (!state.available && !state.granted) return null;
  if (!state.available && state.granted) {
    return (
      <section data-testid="people-consent-paused" className="mb-5 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-white/60" />
            <div><h2 className="font-black">People recognition is paused</h2><p className="mt-1 text-sm leading-6 text-white/50">SnapNext is not starting new People processing in this environment. Your previous choice is preserved, and you can still turn it off and request deletion.</p></div>
          </div>
          <RevokeButtons busy={busy} confirmRevoke={confirmRevoke} setConfirmRevoke={setConfirmRevoke} revoke={revoke} />
        </div>
      </section>
    );
  }

  if (state.granted) {
    return (
      <section data-testid="people-consent-granted" className="mb-5 rounded-3xl border border-emerald-300/20 bg-emerald-500/[0.07] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
            <div><h2 className="font-black">People recognition is on</h2><p className="mt-1 text-sm leading-6 text-white/50">Eligible photos can use People recognition after SnapNext&apos;s local face-count gate.</p></div>
          </div>
          <RevokeButtons busy={busy} confirmRevoke={confirmRevoke} setConfirmRevoke={setConfirmRevoke} revoke={revoke} />
        </div>
      </section>
    );
  }

  return (
    <section data-testid="people-consent-off" className="mb-5 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-pink-200" />
          <div>
            <h2 className="font-black">Choose whether SnapNext may recognize people</h2>
            <p className="mt-1 text-sm leading-6 text-white/50">Local face counting stays in your browser. Only eligible 1–4 face photos may enter the configured People recognition service, and only after you explicitly enable it.</p>
          </div>
        </div>
        <button onClick={grant} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-xs font-black text-black disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Enable People recognition</button>
      </div>
    </section>
  );
}
