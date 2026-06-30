'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

const PREF_LABEL = {
  product: 'Product updates',
  community: 'Community notifications',
  favorites: 'Favorites notifications',
  marketing: 'Marketing emails',
};

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-white/50">Loading…</div>}>
      <UnsubscribeInner />
    </Suspense>
  );
}

function UnsubscribeInner() {
  const params = useSearchParams();
  const token = params.get('t') || '';
  const [state, setState] = useState({ checking: true, ok: false, key: '' });

  useEffect(() => {
    if (!token) { setState({ checking: false, ok: false, key: '' }); return; }
    fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setState({ checking: false, ok: !!d.ok, key: d.prefKey || '' }))
      .catch(() => setState({ checking: false, ok: false, key: '' }));
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
            <Loader2 className="h-6 w-6 animate-spin mx-auto"/>
          ) : state.ok ? (
            <>
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center"><CheckCircle2 className="h-6 w-6"/></div>
              <h1 className="mt-4 text-2xl font-bold">You have been unsubscribed</h1>
              <p className="mt-2 text-sm text-white/70">You will no longer receive <strong>{PREF_LABEL[state.key] || 'these'}</strong>. You can re-enable this anytime in Settings.</p>
              <p className="mt-2 text-xs text-white/50">Transactional emails (verification, password resets, security alerts) will still be sent for your account safety.</p>
              <Link href="/settings" className="mt-5 inline-block px-5 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-sm">Manage preferences</Link>
            </>
          ) : (
            <>
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 grid place-items-center"><AlertTriangle className="h-6 w-6"/></div>
              <h1 className="mt-4 text-2xl font-bold">Invalid unsubscribe link</h1>
              <p className="mt-2 text-sm text-white/70">This link is invalid or expired. Manage your email preferences from Settings instead.</p>
              <Link href="/settings" className="mt-5 inline-block px-5 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-sm">Open settings</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
