'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-white/50">Loading…</div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';
  const [state, setState] = useState({ checking: true, ok: false, reason: '' });

  useEffect(() => {
    if (!token) { setState({ checking: false, ok: false, reason: 'missing' }); return; }
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ d, ok: r.ok })))
      .then(({ d, ok }) => setState({ checking: false, ok: !!d.ok, reason: d.reason || '' }))
      .catch(() => setState({ checking: false, ok: false, reason: 'invalid' }));
  }, [token]);

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <BrandLogo size={48} priority />
          <span className="font-semibold text-lg">SnapNext AI</span>
        </Link>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-8 text-center">
          {state.checking ? (
            <div className="py-6"><Loader2 className="h-6 w-6 animate-spin mx-auto"/><p className="mt-3 text-sm text-white/60">Verifying your email…</p></div>
          ) : state.ok ? (
            <>
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center"><CheckCircle2 className="h-6 w-6"/></div>
              <h1 className="mt-4 text-2xl font-bold">Email verified 🎉</h1>
              <p className="mt-2 text-sm text-white/70">Your account is fully activated. A welcome email is on the way.</p>
              <button onClick={() => router.push('/dashboard')} className="mt-5 inline-block px-5 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-sm">Continue to dashboard</button>
            </>
          ) : (
            <>
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 grid place-items-center"><AlertTriangle className="h-6 w-6"/></div>
              <h1 className="mt-4 text-2xl font-bold">
                {state.reason === 'expired' ? 'Link expired' : state.reason === 'missing' ? 'Missing token' : 'Invalid link'}
              </h1>
              <p className="mt-2 text-sm text-white/70">
                {state.reason === 'expired' ? 'Verification links expire after 24 hours. Sign in and request a new one.' : 'We could not verify this email link. Sign in and request a new verification email.'}
              </p>
              <Link href="/login" className="mt-5 inline-block px-5 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-sm">Sign in</Link>
            </>
          )}
          <p className="mt-6 text-xs text-white/40 flex items-center justify-center gap-1"><ShieldCheck className="h-3 w-3"/> Verification links are single-use and expire in 24 hours.</p>
        </div>
      </div>
    </div>
  );
}
