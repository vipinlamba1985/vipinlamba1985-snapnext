'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, Loader2, Lock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';

function scorePassword(p) {
  if (!p) return { score: 0, label: 'Too short', color: 'bg-white/10' };
  let s = 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const buckets = [
    { label: 'Too short', color: 'bg-rose-500' },
    { label: 'Weak', color: 'bg-rose-500' },
    { label: 'Fair', color: 'bg-amber-400' },
    { label: 'Good', color: 'bg-emerald-400' },
    { label: 'Strong', color: 'bg-emerald-500' },
    { label: 'Excellent', color: 'bg-gradient-to-r from-emerald-400 to-fuchsia-500' },
  ];
  return { score: s, ...buckets[s] };
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-white/50">Loading…</div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [tokenState, setTokenState] = useState({ ok: false, reason: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setTokenState({ ok: false, reason: 'missing' }); setChecking(false); return; }
    fetch(`/api/auth/reset/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setTokenState({ ok: !!d.ok, reason: d.reason || '' }))
      .catch(() => setTokenState({ ok: false, reason: 'invalid' }))
      .finally(() => setChecking(false));
  }, [token]);

  const strength = useMemo(() => scorePassword(password), [password]);
  const tooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 6 && password === confirm && !submitting;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not reset password.');
      } else {
        setDone(true);
        setTimeout(() => router.push('/login'), 1800);
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center"><Camera className="h-5 w-5" /></div>
          <span className="font-semibold text-lg">SnapNext AI</span>
        </Link>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-8">
          {checking ? (
            <div className="py-8 text-center text-sm text-white/60">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Verifying link…
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-bold">Password updated</h2>
              <p className="mt-2 text-sm text-white/70">Redirecting to sign in…</p>
            </div>
          ) : !tokenState.ok ? (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 grid place-items-center">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-bold">
                {tokenState.reason === 'expired' ? 'Link expired' :
                 tokenState.reason === 'used' ? 'Link already used' :
                 tokenState.reason === 'missing' ? 'Missing reset link' : 'Invalid reset link'}
              </h2>
              <p className="mt-2 text-sm text-white/70">
                {tokenState.reason === 'expired'
                  ? 'Reset links expire after 1 hour for your security. Request a new one.'
                  : tokenState.reason === 'used'
                  ? 'This link has already been used. Request a new one if you need to reset again.'
                  : 'This password reset link is invalid or no longer valid.'}
              </p>
              <Link href="/forgot-password" className="mt-5 inline-block px-4 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-sm">
                Request a new link
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-400" /> Set a new password</h1>
              <p className="text-sm text-white/60 mt-1">Use at least 6 characters. A mix of letters, numbers and symbols is best.</p>
              <form onSubmit={submit} className="mt-6 space-y-4" suppressHydrationWarning>
                <div>
                  <label htmlFor="new-password" className="text-xs text-white/60">New password</label>
                  <div className="mt-1">
                    <PasswordInput
                      id="new-password"
                      required
                      minLength={6}
                      name="new-password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {/* Strength meter */}
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full transition-all ${strength.color}`}
                        style={{ width: `${Math.min(100, (strength.score / 5) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-white/50">Strength</span>
                      <span className={`font-medium ${tooShort ? 'text-rose-300' : 'text-white/80'}`}>{tooShort ? 'Too short' : strength.label}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="text-xs text-white/60">Confirm password</label>
                  <div className="mt-1">
                    <PasswordInput
                      id="confirm-password"
                      required
                      minLength={6}
                      name="confirm-password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                  {mismatch && <p className="mt-1 text-xs text-rose-300">Passwords don't match.</p>}
                </div>
                {error && <div className="text-sm text-rose-300">{error}</div>}
                <button
                  disabled={!canSubmit}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Update password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
