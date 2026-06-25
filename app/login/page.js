'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Camera, Loader2, Database, Shield } from 'lucide-react';
import { setToken, setStoredUser } from '@/lib/api-client';
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
      toast.error('Supabase authentication callback failed. Please try again.');
    }
  }, [searchParams]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        // --- SUPABASE CLIENT-SIDE AUTH ---
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        if (data?.session) {
          setToken(data.session.access_token);
          setStoredUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.name || data.user.email.split('@')[0],
            role: 'user',
            createdAt: data.user.created_at,
          });
          toast.success('Successfully signed in with Supabase!');
          router.push('/dashboard');
        } else {
          toast.info('Please check your email to complete verification or log in.');
        }
      } else {
        toast.error('Supabase is not configured yet.');
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
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center">
            <Camera className="h-5 w-5" />
          </div>
          <span className="font-semibold text-lg">SnapNext AI</span>
        </Link>
        
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-8">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-white/60 mt-1">Sign in to access your memories.</p>

          {!isSupabaseConfigured ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
                <div className="flex gap-2 items-start">
                  <Shield className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold block animate-pulse">Supabase Not Connected</span>
                    Provide <code className="text-xs font-mono bg-white/5 px-1 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_URL</code> in settings to activate real database sign in.
                  </div>
                </div>
              </div>
              
              <Link
                href="/demo-login"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-white hover:opacity-90 transition shadow-lg shadow-pink-500/10"
              >
                Access Demo Sandbox
              </Link>
            </div>
          ) : (
            <>
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
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-pink-400/50"
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
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign in with Supabase
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-white/60">
                No account?{' '}
                <Link href="/signup" className="text-pink-300 hover:underline">
                  Create one
                </Link>
              </p>
              <p className="mt-2 text-center text-sm">
                <Link href="/forgot-password" className="text-white/50 hover:text-pink-300">
                  Forgot password?
                </Link>
              </p>
            </>
          )}
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
