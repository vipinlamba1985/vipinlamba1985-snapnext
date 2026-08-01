'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, logout, getStoredUser, setStoredUser } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { entitlementForUser } from '@/lib/entitlements';
import { toast } from 'sonner';
import {
  CheckCircle2, ChevronRight, Cloud, Crown, Download, Heart, LifeBuoy, Loader2,
  LogOut, Mail, Network, Settings2, Shield, ShieldCheck, Sparkles, Trash2, WalletCards,
} from 'lucide-react';

const PREF_LABELS = {
  product: { label: 'Product updates', desc: 'New features, tips, and improvements.' },
  community: { label: 'Community notifications', desc: 'Activity in your communities.' },
  favorites: { label: 'Trusted people', desc: 'Favorite requests and shared albums.' },
  marketing: { label: 'Occasional offers', desc: 'Promotions, surveys, and partner offers.' },
};

const EXPERIENCES = [['free', 'Free'], ['plus', 'Plus'], ['pro', 'Pro'], ['family', 'Family'], ['super_user', 'Super User']];
const PERSONAS = [['new_user', 'New User'], ['active_user', 'Active User'], ['creator', 'Creator'], ['family_member', 'Family Member'], ['photographer', 'Photographer'], ['business_user', 'Business User'], ['content_creator', 'Content Creator'], ['memory_collector', 'Memory Collector'], ['power_user', 'Power User']];
const STORAGE_STATES = [['empty', 'Empty'], ['5gb', '5 GB'], ['100gb', '100 GB'], ['1tb', '1 TB']];
const CREDIT_STATES = [['low', 'Low'], ['half', 'Half'], ['full', 'Full'], ['unlimited', 'Unlimited']];
const NOTIFICATION_STATES = [['none', 'None'], ['normal', 'Normal'], ['heavy', 'Heavy']];
const FEATURE_FLAGS = [['aiStudio', 'Create'], ['aiVideo', 'AI Video'], ['aiMemory', 'Memories'], ['aiCommand', 'AI Command'], ['premiumBackup', 'Premium Backup'], ['favorites', 'Favorites'], ['community', 'Community']];

export default function Settings() {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [devPlan, setDevPlan] = useState(null);
  const [prefs, setPrefs] = useState({ product: true, community: true, favorites: true, marketing: false });
  const [emailVerified, setEmailVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    const me = await apiFetch('/auth/me');
    setUser(me.user);
    setStoredUser(me.user);
    apiFetch('/dev/effective-plan').then(setDevPlan).catch(() => setDevPlan(null));
    const emailPrefs = await apiFetch('/settings/email-prefs');
    setPrefs(emailPrefs.prefs);
    setEmailVerified(!!emailPrefs.emailVerified);
  }

  useEffect(() => {
    setUser(getStoredUser());
    apiFetch('/storage/usage').then(setUsage).catch(() => {});
    apiFetch('/dev/effective-plan').then(setDevPlan).catch(() => setDevPlan(null));
    refresh().catch(() => {});
  }, []);

  async function toggle(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const response = await apiFetch('/settings/email-prefs', { method: 'PUT', body: JSON.stringify({ [key]: next[key] }) });
      setPrefs(response.prefs);
      toast.success(`${PREF_LABELS[key].label} ${next[key] ? 'enabled' : 'disabled'}`);
    } catch (e) {
      toast.error(e.message);
      setPrefs(prefs);
    }
  }

  async function resendVerify() {
    setResending(true);
    try {
      const response = await apiFetch('/auth/verify/send', { method: 'POST' });
      if (response.alreadyVerified) {
        setEmailVerified(true);
        toast.success('Your email is already verified.');
      } else {
        toast.success('Verification email sent. Check your inbox.');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setResending(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await apiFetch('/auth/delete-account', { method: 'POST' });
      toast.success('Your account and all your data have been permanently deleted.');
      logout();
    } catch (e) {
      toast.error(e?.message || 'Failed to delete account');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function updateDeveloperProfile(patch) {
    try {
      const next = await apiFetch('/dev/effective-plan', { method: 'POST', body: JSON.stringify(patch) });
      setDevPlan(next);
      toast.success('Developer Test Mode updated');
      window.location.reload();
    } catch (e) {
      toast.error(e?.message || 'Failed to update developer mode');
    }
  }

  async function clearDeveloperPlan() {
    try {
      const next = await apiFetch('/dev/effective-plan', { method: 'DELETE' });
      setDevPlan(next);
      toast.success('Returned to real account');
      window.location.reload();
    } catch (e) {
      toast.error(e?.message || 'Failed to clear developer mode');
    }
  }

  const entitlement = entitlementForUser(user);
  const realIsSuper = !!entitlement.realIsSuper;
  const isSuper = devPlan?.effectivePlan ? devPlan.effectivePlan === 'super_user' : entitlement.isSuper;
  const profile = devPlan?.developerProfile || {};
  const planLabel = devPlan?.overrideActive ? `Testing as ${devPlan.effectivePlanName}` : entitlement.badge;
  const storageLabel = usage ? (usage.isSuper ? `${formatBytes(usage.usage.bytes)} protected · Unlimited` : `${formatBytes(usage.usage.bytes)} of ${formatBytes(usage.plan.storageBytes)}`) : 'View storage and backup';
  const optionClass = active => `rounded-full border px-3 py-2 text-xs font-semibold ${active ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`;

  const hubs = [
    { id: 'billing', title: 'Plan & billing', detail: planLabel, href: '/billing', icon: WalletCards },
    { id: 'storage', title: 'Storage & backup', detail: storageLabel, href: '/smart-sync', icon: Cloud },
    { id: 'favorites', title: 'Trusted circle', detail: 'Private, permission-based sharing', href: '/trusted-circle', icon: Heart },
    { id: 'circles', title: 'Circles', detail: 'People and interests you follow', href: '/circles', icon: Network },
    { id: 'downloads', title: 'Downloads & export', detail: 'Take your memories with you', href: '/downloads', icon: Download },
    { id: 'support', title: 'Help & support', detail: 'Get help when you need it', href: '/support', icon: LifeBuoy },
    ...(realIsSuper ? [{ id: 'admin', title: 'Admin', detail: 'Owner-only operations and controls', href: '/admin', icon: Shield }] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-32 md:pb-12">
      <header data-testid="you-header" className="rounded-[2rem] border border-white/8 bg-gradient-to-br from-white/[0.055] to-white/[0.02] p-5 md:p-6">
        <div className="flex items-center gap-4">
          <div data-testid="you-avatar" className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-black ring-2 ring-white/10" style={{ background: user?.avatarColor || '#a855f7' }}>{user?.name?.[0]?.toUpperCase() || 'U'}</div>
          <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">You</p><h1 className="mt-1 truncate text-2xl font-black md:text-3xl">{user?.name || 'Your SnapNext'}</h1><p className="mt-1 truncate text-sm text-white/45">{user?.email}</p><div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-white/55">{isSuper && <Crown className="h-3.5 w-3.5 text-amber-300" />}{planLabel}</div></div>
        </div>
        <p className="mt-5 text-sm leading-6 text-white/48">Your digital life, your control. Manage the people, storage, plan, privacy, and account behind your memories.</p>
      </header>

      <section data-testid="you-hub-grid">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-black">Your SnapNext</h2><Settings2 className="h-5 w-5 text-white/30" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {hubs.map(({ id, title, detail, href, icon: Icon }) => <Link data-testid={`you-hub-${id}`} key={id} href={href} className="flex min-h-24 items-center gap-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.05]"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/18 via-purple-500/14 to-cyan-500/10"><Icon className="h-5 w-5 text-pink-100" /></div><div className="min-w-0 flex-1"><h3 className="font-black">{title}</h3><p className="mt-1 truncate text-sm text-white/42">{detail}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-white/25" /></Link>)}
        </div>
      </section>

      <section data-testid="you-security" className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/10"><ShieldCheck className="h-5 w-5 text-emerald-200" /></div><div><h2 className="font-black">Account security</h2><p className="mt-0.5 text-sm text-white/42">Keep access to your memories protected.</p></div></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] p-4">
          <div>{emailVerified ? <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-200"><CheckCircle2 className="h-4 w-4" />Email verified</div> : <><div className="text-sm font-bold">Verify your email</div><div className="mt-1 text-xs text-white/42">Verification helps protect account recovery.</div></>}</div>
          {!emailVerified && <button data-testid="you-resend-verification" onClick={resendVerify} disabled={resending} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-black text-black disabled:opacity-60">{resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Resend email</button>}
        </div>
      </section>

      <section data-testid="you-notifications" className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
        <h2 className="font-black">Notifications & email</h2>
        <p className="mt-1 text-sm text-white/42">Security and account-recovery emails are always sent.</p>
        <div className="mt-4 divide-y divide-white/5">
          {Object.entries(PREF_LABELS).map(([key, meta]) => <div key={key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{meta.label}</h3><p className="mt-1 text-xs leading-5 text-white/40">{meta.desc}</p></div><button data-testid={`you-pref-${key}`} type="button" onClick={() => toggle(key)} aria-pressed={!!prefs[key]} aria-label={`Toggle ${meta.label}`} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${prefs[key] ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/15'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${prefs[key] ? 'left-6' : 'left-1'}`} /></button></div>)}
        </div>
      </section>

      {devPlan && <details data-testid="you-developer-mode" className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5">
        <summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-300/10"><Sparkles className="h-5 w-5 text-amber-100" /></div><div><h2 className="font-black text-amber-50">Developer testing</h2><p className="mt-0.5 text-xs text-amber-100/55">Preview plans and personas without changing billing or real data.</p></div></div><span className="rounded-full border border-amber-300/20 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-100/70">{devPlan.overrideActive ? 'Active' : 'Closed by default'}</span></div></summary>
        <div className="mt-5 space-y-5 border-t border-amber-200/10 pt-5">
          <DevChoice label="Experience" values={EXPERIENCES} current={devPlan.effectivePlan} onChange={value => updateDeveloperProfile({ experience: value })} optionClass={optionClass} />
          <DevChoice label="Persona" values={PERSONAS} current={profile.persona} onChange={value => updateDeveloperProfile({ persona: value })} optionClass={optionClass} />
          <DevChoice label="Storage" values={STORAGE_STATES} current={profile.storage} onChange={value => updateDeveloperProfile({ storage: value })} optionClass={optionClass} />
          <DevChoice label="AI credits" values={CREDIT_STATES} current={profile.aiCredits} onChange={value => updateDeveloperProfile({ aiCredits: value })} optionClass={optionClass} />
          <DevChoice label="Notifications" values={NOTIFICATION_STATES} current={profile.notifications} onChange={value => updateDeveloperProfile({ notifications: value })} optionClass={optionClass} />
          <fieldset><legend className="mb-2 text-xs font-black uppercase tracking-wider text-amber-100/65">Feature flags</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{FEATURE_FLAGS.map(([flag, label]) => <label key={flag} className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white/70"><input type="checkbox" checked={profile.featureFlags?.[flag] !== false} onChange={event => updateDeveloperProfile({ featureFlags: { [flag]: event.target.checked } })} />{label}</label>)}</div></fieldset>
          {devPlan.overrideActive && <button data-testid="you-dev-reset" onClick={clearDeveloperPlan} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-white/70">Return to real account</button>}
        </div>
      </details>}

      <section data-testid="you-account-actions" className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
        <h2 className="font-black">Account actions</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button data-testid="you-sign-out" onClick={logout} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/8 bg-white/5 px-4 text-sm font-bold"><LogOut className="h-4 w-4" />Sign out</button>
          <Link data-testid="you-export-data" href="/downloads" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/8 bg-white/5 px-4 text-sm font-bold"><Download className="h-4 w-4" />Export my data</Link>
          {!confirmDelete ? <button data-testid="you-delete-account-start" onClick={() => setConfirmDelete(true)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 text-sm font-bold text-rose-200"><Trash2 className="h-4 w-4" />Delete account</button> : <div data-testid="you-delete-confirmation" className="w-full rounded-2xl border border-rose-500/25 bg-rose-950/20 p-4"><p className="text-sm font-bold text-rose-100">Delete everything permanently?</p><p className="mt-1 text-xs leading-5 text-rose-100/60">This deletes your account, media files, and account data. This cannot be undone.</p><div className="mt-3 flex gap-2"><button data-testid="you-delete-account-confirm" onClick={handleDeleteAccount} disabled={deleting} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-rose-600 px-4 text-xs font-black disabled:opacity-60">{deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Yes, delete everything</button><button data-testid="you-delete-account-cancel" onClick={() => setConfirmDelete(false)} disabled={deleting} className="min-h-10 rounded-full bg-white/8 px-4 text-xs font-black text-white/70">Cancel</button></div></div>}
        </div>
      </section>
    </div>
  );
}

function DevChoice({ label, values, current, onChange, optionClass }) {
  return <fieldset><legend className="mb-2 text-xs font-black uppercase tracking-wider text-amber-100/65">{label}</legend><div className="flex flex-wrap gap-2">{values.map(([value, title]) => <label key={value} className={optionClass(current === value)}><input className="sr-only" type="radio" checked={current === value} onChange={() => onChange(value)} />{title}</label>)}</div></fieldset>;
}
