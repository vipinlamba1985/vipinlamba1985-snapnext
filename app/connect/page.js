'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Laptop, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { apiFetch, getToken } from '@/lib/api-client';

const STORED_PAIR_CODE = 'snapnext_computer_pair_code';

export default function ComputerConnectPage() {
  const router = useRouter();
  const [pairCode, setPairCode] = useState('');
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState('');
  const consumeStarted = useRef(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(STORED_PAIR_CODE) || '';
    if (saved) setPairCode(saved);
  }, []);

  useEffect(() => {
    if (!session?.id || !['claimed', 'approved'].includes(session.status)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await apiFetch(`/computer-handoff?id=${encodeURIComponent(session.id)}`);
        if (!cancelled && data?.session) setSession(data.session);
      } catch {
        // The phone remains the source of approval; a transient poll can retry.
      }
    };
    const timer = window.setInterval(() => void poll(), 1800);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.id, session?.status]);

  useEffect(() => {
    if (session?.status !== 'approved' || !session?.id || consumeStarted.current) return;
    consumeStarted.current = true;
    apiFetch('/computer-handoff', {
      method: 'POST',
      body: JSON.stringify({ action: 'consume', id: session.id }),
    }).then((data) => {
      window.sessionStorage.removeItem(STORED_PAIR_CODE);
      router.replace(data?.uploadPath || '/upload/discover?continued=computer');
      router.refresh();
    }).catch((nextError) => {
      consumeStarted.current = false;
      setError(nextError?.message || 'The handoff changed. Please start a new pairing from your phone.');
    });
  }, [router, session?.id, session?.status]);

  async function claim(event) {
    event.preventDefault();
    const normalized = pairCode.trim().toUpperCase();
    if (!normalized) return;

    window.sessionStorage.setItem(STORED_PAIR_CODE, normalized);
    setError('');
    setNeedsSignIn(false);

    if (!getToken()) {
      setNeedsSignIn(true);
      return;
    }

    setBusy(true);
    try {
      const data = await apiFetch('/computer-handoff', {
        method: 'POST',
        body: JSON.stringify({ action: 'claim', pairCode: normalized }),
      });
      if (!data?.session?.id) throw new Error('Could not claim this pairing session.');
      setSession(data.session);
    } catch (nextError) {
      setError(nextError?.message || 'Could not connect this computer.');
    } finally {
      setBusy(false);
    }
  }

  const terminal = session && ['cancelled', 'expired'].includes(session.status);

  return (
    <main className="min-h-screen bg-[#07020f] px-5 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mx-auto flex w-fit items-center gap-3">
          <BrandLogo size={44} priority />
          <span className="text-lg font-black">SnapNext AI</span>
        </Link>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-sky-300/10 text-sky-100">
            <Laptop className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-center text-3xl font-black tracking-tight">Continue your backup here</h1>
          <p className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-white/55">
            Enter the short pairing code shown on your phone. This computer must be signed in to the same SnapNext account.
          </p>

          {!session && (
            <form onSubmit={claim} className="mt-7 space-y-4">
              <div>
                <label htmlFor="pair-code" className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Pairing code</label>
                <input
                  id="pair-code"
                  value={pairCode}
                  onChange={(event) => setPairCode(event.target.value)}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="ABCD-EFGH"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-center font-mono text-2xl font-black uppercase tracking-[0.16em] text-white outline-none focus:border-sky-300/40"
                />
              </div>
              <button disabled={busy || !pairCode.trim()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 px-6 py-3 text-sm font-black text-slate-950 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                Connect this computer
              </button>
            </form>
          )}

          {needsSignIn && (
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-50/75">
              Sign in on this computer first. Your pairing code is kept only in this browser tab while you sign in.
              <Link href="/login?next=/connect" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-5 py-2.5 font-black text-black">
                Sign in to SnapNext
              </Link>
            </div>
          )}

          {session?.status === 'claimed' && (
            <div className="mt-7 rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.08] p-5 text-center">
              <ShieldCheck className="mx-auto h-7 w-7 text-emerald-200" />
              <div className="mt-3 text-sm font-black text-emerald-50">Check your phone</div>
              <div data-testid="desktop-verification-code" className="mt-3 font-mono text-4xl font-black tracking-[0.16em] text-white">{session.verificationCode}</div>
              <p className="mt-3 text-sm leading-6 text-emerald-50/60">Approve only if your phone shows this exact code.</p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-white/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for phone approval
              </div>
            </div>
          )}

          {session?.status === 'approved' && (
            <div className="mt-7 rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.08] p-5 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-200" />
              <div className="mt-3 text-lg font-black text-white">Approved</div>
              <p className="mt-2 text-sm text-white/55">Opening SnapNext Add for your large backup…</p>
            </div>
          )}

          {terminal && (
            <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
              This pairing {session.status === 'expired' ? 'expired' : 'was cancelled'}. Start a new one from your phone.
            </div>
          )}

          {error && <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100">{error}</div>}

          <div className="mt-7 flex items-start gap-3 border-t border-white/10 pt-5 text-xs leading-5 text-white/35">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Pairing expires after 5 minutes. The phone grants approval, and no phone login token or photo bytes are transferred to this computer.
          </div>
        </section>
      </div>
    </main>
  );
}
