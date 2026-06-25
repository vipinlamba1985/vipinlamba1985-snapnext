'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, logout, getStoredUser, setStoredUser } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
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
    const ep = await apiFetch('/settings/email-prefs'); setPrefs(ep.prefs); setEmailVerified(!!ep.emailVerified);
  }

  useEffect(() => {
    setUser(getStoredUser());
    apiFetch('/storage/usage').then(setUsage).catch(() => {});
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

  const isSuper = user?.plan === 'super_user' || user?.role === 'admin';

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
              {isSuper ? <><Crown className="h-3 w-3 text-amber-400"/> Super User · Family Access</> : (user?.plan?.toUpperCase() || 'FREE')}
            </div>
          </div>
        </div>
      </section>

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
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-medium mb-3">Account actions</div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={logout} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm"><LogOut className="h-4 w-4"/> Sign out</button>
          <Link href="/downloads" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm">Export my data</Link>
          
          {!confirmDelete ? (
            <button 
              onClick={() => setConfirmDelete(true)} 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm hover:bg-rose-500/20 transition"
            >
              Delete account
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-500/30 rounded-2xl p-3 w-full sm:w-auto">
              <span className="text-xs text-rose-200 font-medium">Are you sure? This deletes ALL media files and data.</span>
              <button 
                onClick={handleDeleteAccount} 
                disabled={deleting}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-60 transition"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Yes, delete everything
              </button>
              <button 
                onClick={() => setConfirmDelete(false)} 
                disabled={deleting}
                className="px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/20 disabled:opacity-60 transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
