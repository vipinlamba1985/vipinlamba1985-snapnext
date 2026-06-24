'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Camera, Loader2, Sparkles, Database, Shield } from 'lucide-react';
import { setToken, setStoredUser } from '@/lib/api-client';
import PasswordInput from '@/components/PasswordInput';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState('database'); // 'database' or 'supabase'

  useEffect(() => {
    if (isSupabaseConfigured) {
      setAuthMode('supabase');
    }
  }, []);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === 'supabase' && isSupabaseConfigured && supabase) {
        // --- SUPABASE CLIENT-SIDE SIGNUP ---
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
            }
          }
        });
        if (error) throw error;
        
        if (data?.session) {
          setToken(data.session.access_token);
          setStoredUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.name || name || data.user.email.split('@')[0],
            role: 'user',
            createdAt: data.user.created_at,
          });
          toast.success('Successfully created account and signed in with Supabase!');
          router.push('/dashboard');
        } else {
          toast.success('Account created! Please check your email to verify your registration.');
          router.push('/login');
        }
      } else {
        // --- STANDARD DATABASE (JWT + MONGO) SIGNUP ---
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        let data = {};
        const text = await res.text();
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`Server returned an invalid response (status ${res.status}). Please verify MONGO_URL/MONGODB_URI is correctly configured.`);
        }
        if (!res.ok) throw new Error(data.error || 'Signup failed');
        setToken(data.token);
        setStoredUser(data.user);
        toast.success('Account created. Please check your email to verify your account.');
        router.push('/dashboard');
      }
    } catch (e) {
      toast.error(e.message || 'Signup failed');
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
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-white/60 mt-1">15 GB free. AI captions included.</p>

          {isSupabaseConfigured && (
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setAuthMode('supabase')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition ${
                  authMode === 'supabase' ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                Supabase Auth
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('database')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition ${
                  authMode === 'database' ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                Database Auth
              </button>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" suppressHydrationWarning>
            <div>
              <label className="text-xs text-white/60">Name</label>
              <input
                name="name"
                autoComplete="name"
                suppressHydrationWarning
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-pink-400/50"
                placeholder="Your name"
              />
            </div>
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
                  minLength={6}
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Register with {authMode === 'supabase' ? 'Supabase' : 'Database'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/60">
            Have an account?{' '}
            <Link href="/login" className="text-pink-300 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
