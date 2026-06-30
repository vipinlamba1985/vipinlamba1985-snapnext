'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Database, Shield, Sparkles, CheckCircle2 } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { setToken, setStoredUser, apiFetch } from '@/lib/api-client';
import PasswordInput from '@/components/PasswordInput';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const errParam = searchParams.get('error');
    if (errParam === 'auth_callback_failed') {
      toast.error('Authentication callback failed. Please try again.');
    }
  }, [searchParams]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      // --- MONGODB + JWT AUTH ---
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      if (data?.token && data?.user) {
        setToken(data.token, data.refreshToken, data.expiresAt);
        document.cookie = `sb-access-token=${encodeURIComponent(data.token)}; path=/; max-age=604800; SameSite=Lax`;
        setStoredUser(data.user);
        toast.success('Successfully signed in!');
        const requestedNext = searchParams.get('next') || '/dashboard';
        const nextPath = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/dashboard';
        router.replace(nextPath);
        router.refresh();
        setTimeout(() => {
          if (window.location.pathname === '/login') window.location.href = nextPath;
        }, 250);
      } else {
        throw new Error('Invalid authentication response');
      }
    } catch (e) {
      toast.error(e.message || 'Authentication failed');
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
        
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-8 relative">
          {isSupabaseConfigured && (
            <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-bold">
              <CheckCircle2 className="h-3 w-3" /> Cloud Sync Active
            </div>
          )}
          
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-white/60 mt-1">Sign in to access your memories.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" suppressHydrationWarning>
            <div>
              <label className="text-xs text-white/60">Email</label>
              <input
                type="email"
                required
                name="email"
                autoComplete="email"
                suppressHydrationWarning
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-pink-400/50 text-white placeholder:text-white/30"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-xs text-white/60">Password</label>
              <div className="mt-1">
                <PasswordInput
                  required
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60 text-white hover:opacity-95 transition cursor-pointer"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in with SnapNext
            </button>
          </form>

          <div className="mt-6 border-t border-white/5 pt-6 text-center space-y-3">
            <p className="text-sm text-white/60">
              No account?{' '}
              <Link href="/signup" className="text-pink-300 hover:underline">
                Create one
              </Link>
            </p>
            <p className="text-sm">
              <Link href="/forgot-password" className="text-white/50 hover:text-pink-300">
                Forgot password?
              </Link>
            </p>
            <div className="pt-2">
              <Link href="/demo-login" className="text-xs text-pink-400/80 hover:text-pink-300 hover:underline">
                Or access Demo Sandbox
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen grid place-items-center bg-[#07020f]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
