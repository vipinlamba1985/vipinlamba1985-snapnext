'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Camera, Home, Upload, Image as ImageIcon, Heart, Sparkles, Send, Users, MessageSquare, Download, Trash2, CreditCard, Settings, Shield, LifeBuoy, LogOut, Crown, Menu, X, Mail, Loader2, Network, RefreshCw, BookOpen, ShieldAlert, BrainCircuit, Film } from 'lucide-react';
import { apiFetch, logout, getStoredUser, setStoredUser, getToken } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import NotificationBell from '@/components/NotificationBell';

const NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/gallery', label: 'Gallery', icon: ImageIcon },
  { href: '/memories', label: 'Memories', icon: Heart },
  { href: '/life-graph', label: 'Life Graph', icon: Network },
  { href: '/journal', label: 'Life Journal', icon: BookOpen },
  { href: '/health', label: 'Memory Health', icon: ShieldAlert },
  { href: '/imports', label: 'Cloud Sync', icon: RefreshCw },
  { href: '/ai-studio', label: 'AI Studio', icon: Sparkles },
  { href: '/ai-video', label: 'AI Video', icon: Film },
  { href: '/ai-command', label: 'AI Command', icon: BrainCircuit, adminOnly: true },
  { href: '/ready-to-post', label: 'Ready to Post', icon: Send },
  { href: '/favorites', label: 'Favorites', icon: Users },
  { href: '/community', label: 'Community', icon: Users, soon: true },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/trash', label: 'Trash', icon: Trash2 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
  { href: '/support', label: 'Support', icon: LifeBuoy },
];

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/gallery', label: 'Gallery', icon: ImageIcon },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/memories', label: 'Memories', icon: Heart },
  { href: '/ai-studio', label: 'AI', icon: Sparkles },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    setUser(getStoredUser());
    apiFetch('/auth/me').then(({ user }) => { setUser(user); setStoredUser(user); setReady(true); })
      .catch(() => { logout(); });
    apiFetch('/storage/usage').then(setUsage).catch(()=>{});
  }, [pathname]);

  const isSuper = user?.plan === 'super_user' || user?.role === 'admin';
  const filteredNav = NAV.filter(n => !n.adminOnly || isSuper);

  if (!ready) {
    return <div className="min-h-screen grid place-items-center text-white/50">Loading…</div>;
  }

  function VerifyBanner({ user, onVerified }) {
    const [sending, setSending] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    if (!user || user.emailVerified || dismissed) return null;
    async function resend() {
      setSending(true);
      try {
        const r = await apiFetch('/auth/verify/send', { method: 'POST' });
        if (r.alreadyVerified) { onVerified?.(); toast.success('Your email is already verified.'); }
        else toast.success('Verification email sent. Check your inbox.');
      } catch (e) { toast.error(e.message); }
      finally { setSending(false); }
    }
    return (
      <div className="mb-5 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/15 to-rose-400/10 p-4 flex flex-wrap items-center gap-3">
        <Mail className="h-5 w-5 text-amber-300" />
        <div className="flex-1 min-w-[200px] text-sm">
          <div className="font-medium">Please verify your email to secure your account.</div>
          <div className="text-white/60 text-xs">We sent a verification link to <span className="text-amber-200">{user.email}</span>.</div>
        </div>
        <button onClick={resend} disabled={sending} className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-white text-black font-medium disabled:opacity-60">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Mail className="h-3.5 w-3.5"/>} Resend email
        </button>
        <button onClick={() => setDismissed(true)} className="text-xs text-white/50 hover:text-white px-2 py-1">Dismiss</button>
      </div>
    );
  }

  const pct = usage && !isSuper && usage.plan?.storageBytes ? Math.min(100, Math.round((usage.usage.bytes / usage.plan.storageBytes) * 100)) : 0;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside className={`fixed md:static z-50 inset-y-0 left-0 w-72 md:w-auto bg-[#0b0414]/95 md:bg-white/[0.02] backdrop-blur border-r border-white/5 transform ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform`}>
        <div className="p-5 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center"><Camera className="h-5 w-5" /></div>
            <span className="font-semibold">SnapNext AI</span>
          </Link>
          <button className="md:hidden" onClick={()=>setOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        {/* User card */}
        <div className="mx-3 mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full grid place-items-center text-sm font-semibold" style={{ background: user?.avatarColor || '#a855f7' }}>{user?.name?.[0]?.toUpperCase() || 'U'}</div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-white/50 flex items-center gap-1">
                {isSuper ? <><Crown className="h-3 w-3 text-amber-400" /> Super User · Family Access</> : (user?.plan?.toUpperCase() || 'FREE')}
              </div>
            </div>
          </div>
          {!isSuper && usage && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: pct + '%' }} />
              </div>
              <div className="mt-1 text-[11px] text-white/50 flex justify-between">
                <span>{formatBytes(usage.usage.bytes)} of {formatBytes(usage.plan.storageBytes)}</span>
                <span>{pct}%</span>
              </div>
            </div>
          )}
          {isSuper && <div className="mt-3 text-[11px] text-amber-300">Unlimited storage • Unlimited AI</div>}
        </div>

        <nav className="px-2 pb-24 space-y-0.5 overflow-y-auto max-h-[calc(100vh-200px)]">
          {filteredNav.map(item => {
            const Active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={()=>setOpen(false)} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm ${Active ? 'bg-gradient-to-r from-pink-500/20 to-purple-600/20 text-white border border-white/10' : 'text-white/70 hover:bg-white/5'}`}>
                <span className="flex items-center gap-3"><Icon className="h-4 w-4" /> {item.label}</span>
                {item.soon && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">Soon</span>}
              </Link>
            );
          })}
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:bg-white/5"><LogOut className="h-4 w-4"/> Sign out</button>
        </nav>
      </aside>

      {/* Main */}
      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 backdrop-blur bg-[#0b0414]/80 border-b border-white/5 px-4 h-14 flex items-center justify-between">
          <button onClick={()=>setOpen(true)}><Menu className="h-5 w-5" /></button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600" />
            <span className="font-semibold text-sm">SnapNext AI</span>
          </Link>
          <NotificationBell />
        </header>

        {/* Desktop top-right bell */}
        <div className="hidden md:flex items-center justify-end px-8 pt-4">
          <NotificationBell />
        </div>

        <main className="px-4 md:px-8 py-6 md:py-8 pb-36 md:pb-10 max-w-6xl">
          <VerifyBanner user={user} onVerified={() => {
            apiFetch('/auth/me').then(({ user }) => { setUser(user); setStoredUser(user); }).catch(() => {});
          }} />
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-3 left-3 right-3 z-40 pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 items-center rounded-[2rem] border border-white/10 bg-[#0b0414]/85 p-2 shadow-2xl shadow-black/50 backdrop-blur-2xl">
            {MOBILE_NAV.map(item => {
              const Active = pathname === item.href;
              const Icon = item.icon;
              const isUpload = item.href === '/upload';
              return (
                <Link key={item.href} href={item.href} className="relative flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-[10px] font-semibold transition active:scale-95">
                  {isUpload ? (
                    <div className="grid h-12 w-12 -mt-8 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-2xl shadow-pink-500/40 ring-4 ring-[#0b0414]/90"><Upload className="h-5 w-5 text-white" /></div>
                  ) : (
                    <Icon className={`h-5 w-5 transition ${Active ? 'text-pink-300 drop-shadow-[0_0_10px_rgba(236,72,153,0.65)]' : 'text-white/55'}`} />
                  )}
                  {Active && !isUpload && <span className="absolute inset-x-3 top-1 h-8 rounded-2xl bg-white/[0.07] -z-10" />}
                  <span className={Active ? 'text-white' : 'text-white/55'}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
