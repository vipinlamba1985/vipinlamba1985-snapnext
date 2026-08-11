'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, BrainCircuit, ChevronDown, Cloud, CreditCard, Crown, Download, Film,
  Heart, Home, Image as ImageIcon, LifeBuoy, Loader2, LogOut, Mail, Menu,
  MessageSquare, Network, Plus, Send, Settings2, Shield, ShieldAlert, Sparkles,
  Trash2, UserRound, Users, X,
} from 'lucide-react';
import { apiFetch, logout, getStoredUser, setStoredUser, getToken } from '@/lib/api-client';
import BrandLogo from '@/components/BrandLogo';
import { formatBytes } from '@/lib/utils';
import { entitlementForUser } from '@/lib/entitlements';
import { canUseAiFeature } from '@/lib/plans';
import { toast } from 'sonner';
import NotificationBell from '@/components/NotificationBell';

const ROUTES = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/gallery', label: 'Library', icon: ImageIcon },
  { href: '/upload', label: 'Add', icon: Plus },
  { href: '/circles', label: 'Circle', icon: Users },
  { href: '/ai-studio', label: 'Create', icon: Sparkles, aiCapability: 'studio' },

  { href: '/profile', label: 'You / Profile', icon: UserRound },
  { href: '/settings', label: 'Settings', icon: Settings2 },
  { href: '/plan-storage', label: 'Plan & storage', icon: CreditCard },
  { href: '/privacy-security', label: 'Privacy & security', icon: Shield },
  { href: '/integrations', label: 'Integrations', icon: Cloud },
  { href: '/support', label: 'Help & support', icon: LifeBuoy },

  // Existing feature routes remain available through their owning experiences,
  // but they no longer compete for primary navigation ownership.
  { href: '/memories', label: 'Memories', icon: Heart, featureFlag: 'aiMemory' },
  { href: '/smart-sync', label: 'Smart Backup', icon: Cloud, featureFlag: 'premiumBackup' },
  { href: '/event-director', label: 'Moments', icon: Sparkles },
  { href: '/trusted-circle', label: 'Trusted circle', icon: Users, featureFlag: 'favorites' },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/journal', label: 'Life Journal', icon: BookOpen },
  { href: '/gallery/cleanup', label: 'Memory Health', icon: ShieldAlert },
  { href: '/life-graph', label: 'Life Graph', icon: Network },
  { href: '/ready-to-post', label: 'Ready to Post', icon: Send },
  { href: '/ai-video', label: 'AI Video', icon: Film, aiCapability: 'video', featureFlag: 'aiVideo' },
  { href: '/community', label: 'Community', icon: Users, featureFlag: 'community' },
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/trash', label: 'Trash', icon: Trash2 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/ai-command', label: 'AI Command', icon: BrainCircuit, adminOnly: true, featureFlag: 'aiCommand' },
  { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
];

// SnapNext Navigation Architecture v1 — FROZEN.
// Discover → Find → Add → Connect → Make.
const PRIMARY_HREFS = ['/dashboard', '/gallery', '/upload', '/circles', '/ai-studio'];

// Secondary controls only. Social relationships stay in Circle; cloud/service
// authorization belongs in Integrations.
const MORE_HREFS = ['/profile', '/settings', '/plan-storage', '/privacy-security', '/integrations', '/support', '/admin'];

function routesInOrder(hrefs, routes) {
  return hrefs.map(href => routes.find(route => route.href === href)).filter(Boolean);
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [devPlan, setDevPlan] = useState(null);
  const [devReady, setDevReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [startup, setStartup] = useState('checking');
  const startupAttempt = useRef(0);

  const loadAccount = useCallback(async () => {
    const attempt = startupAttempt.current + 1;
    startupAttempt.current = attempt;
    setStartup('checking');
    if (!getToken()) {
      setStartup('signin');
      router.replace('/login');
      return;
    }
    const storedUser = getStoredUser();
    if (storedUser) setUser(storedUser);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await apiFetch('/auth/me', { signal: controller.signal });
      if (startupAttempt.current !== attempt) return;
      if (!response?.user) throw new Error('Your account could not be opened.');
      setUser(response.user);
      setStoredUser(response.user);
      setStartup('ready');
    } catch (error) {
      if (startupAttempt.current !== attempt) return;
      if (error?.status === 401) {
        setStartup('signin');
        logout();
        return;
      }
      setStartup('slow');
    } finally {
      window.clearTimeout(timeout);
    }
  }, [router]);

  useEffect(() => {
    loadAccount();
    return () => { startupAttempt.current += 1; };
  }, [loadAccount]);

  useEffect(() => {
    if (startup !== 'ready') return;
    apiFetch('/storage/usage').then(setUsage).catch(() => {});
    setDevReady(false);
    apiFetch('/dev/effective-plan').then(setDevPlan).catch(() => setDevPlan(null)).finally(() => setDevReady(true));
  }, [startup]);

  const activeRoute = ROUTES.find(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const isAdminAuthRoute = !!activeRoute?.adminOnly;
  const entitlement = entitlementForUser(user);
  const realIsSuper = entitlement.realIsSuper;
  const effectivePlanId = devPlan?.effectivePlan || entitlement.planId;
  const currentIsSuperExperience = effectivePlanId === 'super_user';
  const currentExperienceName = devPlan?.effectivePlanName || entitlement.plan.name;
  const currentBadge = devPlan?.overrideActive ? `Testing as ${currentExperienceName}` : entitlement.badge;
  const routeCapabilityAllowed = !activeRoute?.aiCapability || canUseAiFeature(effectivePlanId, activeRoute.aiCapability);

  const visibleRoutes = ROUTES.filter(route => {
    // The five frozen primary destinations never disappear because of plan or
    // developer flags. Access can be gated after navigation, but the mental
    // model remains stable for every user.
    if (PRIMARY_HREFS.includes(route.href)) return true;
    if (route.featureFlag && devPlan?.developerProfile?.featureFlags?.[route.featureFlag] === false) return false;
    if (route.adminOnly) return realIsSuper;
    return true;
  });
  const primaryNav = routesInOrder(PRIMARY_HREFS, visibleRoutes);
  const moreNav = routesInOrder(MORE_HREFS, visibleRoutes);
  const moreActive = moreNav.some(item => pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => {
    const blockedByAuth = isAdminAuthRoute && !realIsSuper;
    const blockedByPlan = devReady && !routeCapabilityAllowed;
    if (startup === 'ready' && (blockedByAuth || blockedByPlan)) router.replace('/billing');
  }, [startup, isAdminAuthRoute, realIsSuper, routeCapabilityAllowed, devReady, router]);

  const waitingForExperience = startup === 'ready' && !!activeRoute?.aiCapability && !devReady;
  const blockedRoute = startup === 'ready' && ((isAdminAuthRoute && !realIsSuper) || (devReady && !routeCapabilityAllowed));

  if (startup !== 'ready' || waitingForExperience || blockedRoute) {
    const recoverable = startup === 'slow';
    return (
      <div className="min-h-screen grid place-items-center px-6 text-white/60">
        <div className="w-full max-w-sm text-center">
          <BrandLogo size={56} className="mx-auto mb-4" priority />
          {!recoverable && <Loader2 className="mx-auto h-5 w-5 animate-spin text-pink-300" />}
          <div className="mt-3 text-sm font-semibold text-white/70">{blockedRoute ? 'Checking plan access…' : recoverable ? 'We’re having trouble opening your account' : 'Opening SnapNext…'}</div>
          {recoverable && <><p className="mt-2 text-xs leading-5 text-white/45">Your memories are safe. Check your connection, then try again.</p><div className="mt-5 flex flex-col gap-2"><button onClick={loadAccount} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black">Try again</button><button onClick={logout} className="rounded-full border border-white/10 px-5 py-3 text-sm font-bold text-white/70">Sign in again</button></div></>}
        </div>
      </div>
    );
  }

  function VerifyBanner({ user: bannerUser, onVerified }) {
    const [sending, setSending] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    if (!bannerUser || bannerUser.isPreview || bannerUser.emailVerified || dismissed) return null;
    async function resend() {
      setSending(true);
      try {
        const response = await apiFetch('/auth/verify/send', { method: 'POST' });
        if (response.alreadyVerified) {
          onVerified?.();
          toast.success('Your email is already verified.');
        } else {
          toast.success('Verification email sent. Check your inbox.');
        }
      } catch (e) {
        toast.error(e.message);
      } finally {
        setSending(false);
      }
    }
    return <div className="mb-5 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/15 to-rose-400/10 p-4 flex flex-wrap items-center gap-3"><Mail className="h-5 w-5 text-amber-300" /><div className="flex-1 min-w-[200px] text-sm"><div className="font-medium">Please verify your email to secure your account.</div><div className="text-white/60 text-xs">We sent a verification link to <span className="text-amber-200">{bannerUser.email}</span>.</div></div><button onClick={resend} disabled={sending} className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-white text-black font-medium disabled:opacity-60">{sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Resend email</button><button onClick={() => setDismissed(true)} className="text-xs text-white/50 hover:text-white px-2 py-1">Dismiss</button></div>;
  }

  const pct = usage && !currentIsSuperExperience && usage.plan?.storageBytes
    ? Math.min(100, Math.round((usage.usage.bytes / usage.plan.storageBytes) * 100))
    : 0;

  return <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
    <aside className={`fixed md:sticky md:top-0 z-50 inset-y-0 left-0 flex h-full md:h-screen w-72 md:w-auto flex-col bg-[#0b0414]/95 md:bg-white/[0.02] backdrop-blur border-r border-white/5 transform ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform`}>
      <div className="p-5 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2"><BrandLogo size={32} priority /><span className="font-semibold">SnapNext AI</span></Link>
        <button className="md:hidden" aria-label="Close More menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
      </div>

      <Link href="/profile" onClick={() => setOpen(false)} className="mx-3 mb-4 block rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.05]">
        <div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full grid place-items-center text-sm font-semibold" style={{ background: user?.avatarColor || '#a855f7' }}>{user?.name?.[0]?.toUpperCase() || 'U'}</div><div className="min-w-0"><div className="text-sm font-medium truncate">{user?.name}</div><div className="text-xs text-white/50 flex items-center gap-1">{devPlan?.overrideActive ? currentBadge : (currentIsSuperExperience ? <><Crown className="h-3 w-3 text-amber-400" />{currentBadge}</> : currentBadge)}</div></div></div>
        {!currentIsSuperExperience && usage && <div className="mt-3"><div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: `${pct}%` }} /></div><div className="mt-1 text-[11px] text-white/50 flex justify-between"><span>{formatBytes(usage.usage.bytes)} of {formatBytes(usage.plan.storageBytes)}</span><span>{pct}%</span></div></div>}
        {currentIsSuperExperience && <div className="mt-3 text-[11px] text-amber-300">Unlimited storage · Unlimited AI</div>}
      </Link>

      <nav aria-label="Primary navigation" data-testid="sidebar-nav" className="flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/30">Discover · Find · Add · Connect · Make</div>
        <div className="space-y-1">{primaryNav.map(item => <NavItem key={item.href} item={item} pathname={pathname} onClick={() => setOpen(false)} />)}</div>

        <details className="mt-3 group" open={moreActive || undefined}>
          <summary className={`flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold ${moreActive ? 'text-white bg-white/[0.045]' : 'text-white/55 hover:bg-white/5'}`}><span>More</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
          <div className="mt-1 space-y-0.5 border-l border-white/8 pl-2">{moreNav.map(item => <NavItem key={item.href} item={item} pathname={pathname} onClick={() => setOpen(false)} compact />)}</div>
        </details>

        <button onClick={logout} className="mt-3 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/55 hover:bg-white/5"><LogOut className="h-4 w-4" />Sign out</button>
      </nav>
    </aside>

    <div className="min-w-0">
      <header className="md:hidden sticky top-0 z-30 backdrop-blur bg-[#0b0414]/80 border-b border-white/5 px-4 h-14 flex items-center justify-between">
        <button aria-label="Open More menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        <Link href="/dashboard" className="flex items-center gap-2"><BrandLogo size={28} priority /><span className="font-semibold text-sm">SnapNext AI</span></Link>
        <NotificationBell />
      </header>
      <div className="hidden md:flex items-center justify-end px-8 pt-4"><NotificationBell /></div>
      {devPlan?.overrideActive && <div className="mx-4 md:mx-8 mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">Developer Test Mode Active</div><div className="text-xs text-amber-100/75">Current Experience: {currentExperienceName.toUpperCase()} · Persona: {devPlan.developerProfile?.persona?.replaceAll('_', ' ') || 'active user'} · Real Account: Super User</div></div><button onClick={() => apiFetch('/dev/effective-plan', { method: 'DELETE' }).then(() => window.location.reload()).catch(e => toast.error(e?.message || 'Failed to reset test mode'))} className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-amber-100">Return to Real Account</button></div>}
      <main className="px-4 md:px-8 py-6 md:py-8 pb-36 md:pb-10 max-w-6xl"><VerifyBanner user={user} onVerified={() => { apiFetch('/auth/me').then(({ user: nextUser }) => { setUser(nextUser); setStoredUser(nextUser); }).catch(() => {}); }} />{children}</main>

      <nav aria-label="Primary mobile navigation" data-testid="primary-mobile-nav" className="md:hidden fixed bottom-3 left-3 right-3 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 items-center rounded-[2rem] border border-white/10 bg-[#0b0414]/85 p-2 shadow-2xl shadow-black/50 backdrop-blur-2xl">
          {primaryNav.map(item => {
            const Active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const isAdd = item.href === '/upload';
            return <Link key={item.href} href={item.href} aria-label={isAdd ? 'Add photos and videos' : item.label} aria-current={Active ? 'page' : undefined} className="relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl py-2 text-[10px] font-semibold transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">{isAdd ? <div className={`grid h-14 w-14 -mt-8 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 shadow-2xl shadow-pink-500/40 ring-4 ring-[#0b0414]/90 transition ${Active ? 'scale-105 ring-pink-300/35' : ''}`}><Plus className="h-7 w-7 text-white" strokeWidth={2.5} /></div> : <Icon className={`h-5 w-5 transition ${Active ? 'text-pink-300 drop-shadow-[0_0_10px_rgba(236,72,153,0.65)]' : 'text-white/55'}`} />}{Active && !isAdd && <span className="absolute inset-x-3 top-1 h-8 rounded-2xl bg-white/[0.07] -z-10" />}{!isAdd && <span className={Active ? 'text-white' : 'text-white/55'}>{item.label}</span>}</Link>;
          })}
        </div>
      </nav>
    </div>
  </div>;
}

function NavItem({ item, pathname, onClick, compact = false }) {
  const Active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return <Link href={item.href} onClick={onClick} className={`flex items-center justify-between gap-3 rounded-xl px-3 ${compact ? 'py-2 text-[13px]' : 'py-2.5 text-sm'} ${Active ? 'bg-gradient-to-r from-pink-500/18 to-purple-600/16 text-white border border-white/8' : 'text-white/65 hover:bg-white/5'}`}><span className="flex items-center gap-3"><Icon className="h-4 w-4" />{item.label}</span></Link>;
}
