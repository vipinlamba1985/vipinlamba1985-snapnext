'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, logout, getStoredUser, setStoredUser } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { entitlementForUser } from '@/lib/entitlements';
import { toast } from 'sonner';
import { Crown, LogOut, Mail, CheckCircle2, Loader2 } from 'lucide-react';

const PREF_LABELS = {
  product: { label: 'Product updates', desc: 'New features, tips, AI improvements.' },
  community: { label: 'Community notifications', desc: 'Activity in your communities.' },
  favorites: { label: 'Favorites notifications', desc: 'Favorite requests, shared albums.' },
  marketing: { label: 'Marketing emails', desc: 'Promotions, surveys, partner offers.' },
};

export default function Settings() {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [devPlan, setDevPlan] = useState(null);
  const [prefs, setPrefs] = useState({ product: true, community: true, favorites: true, marketing: false });
  const [emailVerified, setEmailVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function refresh() {
    const me = await apiFetch('/auth/me'); setUser(me.user); setStoredUser(me.user);
    apiFetch('/dev/effective-plan').then(setDevPlan).catch(() => setDevPlan(null));
    const ep = await apiFetch('/settings/email-prefs'); setPrefs(ep.prefs); setEmailVerified(!!ep.emailVerified);
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
      const r = await apiFetch('/settings/email-prefs', { method: 'PUT', body: JSON.stringify({ [key]: next[key] }) });
      setPrefs(r.prefs);
      toast.success(`${PREF_LABELS[key].label} ${next[key] ? 'enabled' : 'disabled'}`);
    } catch (e) { toast.error(e.message); setPrefs(prefs); }
  }

  async function resendVerify() {
    setResending(true);
    try {
      const r = await apiFetch('/auth/verify/send', { method: 'POST' });
      if (r.alreadyVerified) { setEmailVerified(true); toast.success('Already verified'); }
      else toast.success('Verification email sent. Check your inbox.');
    } catch (e) { toast.error(e.message); }
    finally { setResending(false); }
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

  async function setDeveloperPlan(plan) {
    return updateDeveloperProfile({ experience: plan });
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
  const isSuper = devPlan?.effectivePlan ? devPlan.effectivePlan === 'super_user' : entitlement.isSuper;
  const profile = devPlan?.developerProfile || {};

  const optionClass = (active) => `rounded-full border px-3 py-2 text-xs font-semibold ${active ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-white/60 mt-1">Your account & preferences.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-medium mb-3">Profile</div>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full grid place-items-center text-lg font-bold" style={{ background: user?.avatarColor || '#a855f7' }}>{user?.name?.[0]?.toUpperCase() || 'U'}</div>
          <div>
            <div className="font-medium">{user?.name}</div>
            <div className="text-sm text-white/60">{user?.email}</div>
            <div className="text-xs mt-1 inline-flex items-center gap-1 text-white/60">
              {isSuper ? <><Crown className="h-3 w-3 text-amber-400"/> {devPlan?.overrideActive ? `Testing as ${devPlan.effectivePlanName}` : entitlement.badge}</> : (devPlan?.overrideActive ? `Testing as ${devPlan.effectivePlanName}` : entitlement.badge)}
            </div>
          </div>
        </div>
      </section>

      {devPlan && (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-100">Developer Test Mode</div>
              <div className="mt-2 grid gap-1 text-xs text-amber-100/75">
                <span>Real Account: <b className="text-amber-50">{devPlan.realAccount}</b></span>
                <span>Current Experience: <b className="text-amber-50">{devPlan.effectivePlanName}</b></span>
                <span>Persona: <b className="text-amber-50 capitalize">{(profile.persona || 'active_user').replaceAll('_', ' ')}</b></span>
              </div>
            </div>
            {devPlan.overrideActive && <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-100">Override active</span>}
          </div>

          <div className="mt-5 space-y-5 text-sm">
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-100/80">Experience</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  ['free', 'Free User'], ['plus', 'Plus User'], ['pro', 'Pro User'], ['family', 'Family User'], ['super_user', 'Super User'],
                ].map(([value, label]) => (
                  <label key={value} className={optionClass(devPlan.effectivePlan === value)}>
                    <input className="sr-only" type="radio" checked={devPlan.effectivePlan === value} onChange={() => setDeveloperPlan(value)} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-100/80">Persona</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  ['new_user', 'New User'], ['active_user', 'Active User'], ['creator', 'Creator'], ['family_member', 'Family Member'], ['photographer', 'Photographer'], ['business_user', 'Business User'], ['content_creator', 'Content Creator'], ['memory_collector', 'Memory Collector'], ['power_user', 'Power User'],
                ].map(([value, label]) => (
                  <label key={value} className={optionClass(profile.persona === value)}>
                    <input className="sr-only" type="radio" checked={profile.persona === value} onChange={() => updateDeveloperProfile({ persona: value })} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-100/80">Storage</legend>
              <div className="flex flex-wrap gap-2">
                {[[ 'empty', 'Empty' ], [ '5gb', '5 GB' ], [ '100gb', '100 GB' ], [ '1tb', '1 TB' ]].map(([value, label]) => (
                  <label key={value} className={optionClass(profile.storage === value)}>
                    <input className="sr-only" type="radio" checked={profile.storage === value} onChange={() => updateDeveloperProfile({ storage: value })} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-100/80">AI Credits</legend>
              <div className="flex flex-wrap gap-2">
                {[[ 'low', 'Low' ], [ 'half', 'Half' ], [ 'full', 'Full' ], [ 'unlimited', 'Unlimited' ]].map(([value, label]) => (
                  <label key={value} className={optionClass(profile.aiCredits === value)}>
                    <input className="sr-only" type="radio" checked={profile.aiCredits === value} onChange={() => updateDeveloperProfile({ aiCredits: value })} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-100/80">Notifications</legend>
              <div className="flex flex-wrap gap-2">
                {[[ 'none', 'None' ], [ 'normal', 'Normal' ], [ 'heavy', 'Heavy' ]].map(([value, label]) => (
                  <label key={value} className={optionClass(profile.notifications === value)}>
                    <input className="sr-only" type="radio" checked={profile.notifications === value} onChange={() => updateDeveloperProfile({ notifications: value })} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-100/80">Feature Flags</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['aiStudio', 'AI Studio'], ['aiVideo', 'AI Video'], ['aiMemory', 'AI Memory'], ['aiCommand', 'AI Command'], ['premiumBackup', 'Premium Backup'], ['favorites', 'Favorites'], ['community', 'Community'],
                ].map(([flag, label]) => (
                  <label key={flag} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80">
                    <input type="checkbox" checked={profile.featureFlags?.[flag] !== false} onChange={(e) => updateDeveloperProfile({ featureFlags: { [flag]: e.target.checked } })} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {devPlan.overrideActive && <button type="button" onClick={clearDeveloperPlan} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/80 hover:bg-white/10">Return to Real Account</button>}
          </div>
          <p className="mt-3 text-xs text-amber-100/65">Temporary session profile only. Persona is stored/displayed for QA now. Billing, Stripe, subscriptions, uploaded media, and your real plan are not changed.</p>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-medium mb-3 flex items-center gap-2"><Mail className="h-4 w-4 text-pink-300"/> Email verification</div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            {emailVerified ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4"/> Verified — {user?.email}</span>
            ) : (
              <>
                <div className="text-sm">Not verified yet.</div>
                <div className="text-xs text-white/60">We sent a link to <span className="text-white/80">{user?.email}</span>.</div>
              </>
            )}
          </div>
          {!emailVerified && (
            <button onClick={resendVerify} disabled={resending} className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60">
              {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Mail className="h-3.5 w-3.5"/>} Resend verification email
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-medium mb-1">Email preferences</div>
        <div className="text-xs text-white/50 mb-4">Transactional emails (verification, password resets, security alerts) are always sent.</div>
        <div className="space-y-3">
          {Object.entries(PREF_LABELS).map(([key, meta]) => (
            <label key={key} className="flex items-start justify-between gap-3 cursor-pointer">
              <div className="min-w-0">
                <div className="text-sm font-medium">{meta.label}</div>
                <div className="text-xs text-white/50">{meta.desc}</div>
              </div>
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-pressed={!!prefs[key]}
                aria-label={`Toggle ${meta.label}`}
                className={`relative h-6 w-11 rounded-full transition-colors ${prefs[key] ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/15'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${prefs[key] ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </label>
          ))}
        </div>
      </section>

      {usage && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm font-medium mb-3">Storage usage</div>
          <div className="flex items-center justify-between text-sm text-white/70">
            <span>{usage.isSuper ? 'Unlimited' : formatBytes(usage.usage.bytes) + ' of ' + formatBytes(usage.plan.storageBytes)}</span>
            <span>{usage.usage.count} items</span>
          </div>
          {usage.storageSimulated && <div className="mt-2 text-xs text-amber-200">Developer storage simulation active. Real uploaded data remains unchanged.</div>}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-medium mb-3">Account actions</div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={logout} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm"><LogOut className="h-4 w-4"/> Sign out</button>
          <Link href="/downloads" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm">Export my data</Link>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm hover:bg-rose-500/20 transition">Delete account</button>
          ) : (
            <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-500/30 rounded-2xl p-3 w-full sm:w-auto">
              <span className="text-xs text-rose-200 font-medium">Are you sure? This deletes ALL media files and data.</span>
              <button onClick={handleDeleteAccount} disabled={deleting} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-60 transition">
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Yes, delete everything
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/20 disabled:opacity-60 transition">Cancel</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
