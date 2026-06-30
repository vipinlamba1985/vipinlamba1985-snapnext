'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?._devUrl) setDevUrl(data._devUrl);
      setSent(true);
    } catch {
      // Same generic state even on errors.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

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
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-8">
          {!sent ? (
            <>
              <h1 className="text-2xl font-bold">Forgot password?</h1>
              <p className="text-sm text-white/60 mt-1">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={submit} className="mt-6 space-y-4" suppressHydrationWarning>
                <div>
                  <label htmlFor="forgot-email" className="text-xs text-white/60">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    name="email"
                    autoComplete="email"
                    suppressHydrationWarning
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-pink-400/50"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send reset link
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 grid place-items-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-bold">Check your inbox</h2>
              <p className="mt-2 text-sm text-white/70">
                If an account exists for this email, a password reset link has been sent.
              </p>
              {devUrl && (
                <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-left text-xs">
                  <div className="font-medium text-amber-200 mb-1">Development preview link</div>
                  <p className="text-amber-100/80 break-all">{devUrl}</p>
                  <p className="mt-2 text-amber-100/60">Email sending is not configured yet. Use this link to continue.</p>
                </div>
              )}
            </div>
          )}
          <p className="mt-6 text-center text-sm">
            <Link href="/login" className="inline-flex items-center gap-1 text-white/60 hover:text-pink-300">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
