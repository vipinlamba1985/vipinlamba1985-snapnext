'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Camera, Loader2, Sparkles } from 'lucide-react';
import { setToken, setStoredUser } from '@/lib/api-client';
import PasswordInput from '@/components/PasswordInput';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password }) });
      let data = {};
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server returned an invalid response (status ${res.status}). Please verify MONGO_URL/MONGODB_URI is correctly configured.`);
      }
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      setToken(data.token); setStoredUser(data.user);
      toast.success('Account created. Please check your email to verify your account.');
      router.push('/dashboard');
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
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
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-white/60 mt-1">15 GB free. AI captions included.</p>
          <form onSubmit={submit} className="mt-6 space-y-4" suppressHydrationWarning>
            <div>
              <label className="text-xs text-white/60">Name</label>
              <input name="name" autoComplete="name" suppressHydrationWarning value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-pink-400/50" placeholder="Your name" />
            </div>
            <div>
              <label className="text-xs text-white/60">Email</label>
              <input type="email" required name="email" autoComplete="email" suppressHydrationWarning value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-pink-400/50" />
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
            <button disabled={loading} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>} Start free
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-white/60">Have an account? <Link href="/login" className="text-pink-300 hover:underline">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
