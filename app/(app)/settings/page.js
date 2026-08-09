'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, ChevronRight, Integrations as IntegrationsIcon, LifeBuoy, Loader2,
  LogOut, Mail, Settings2, Shield, Trash2, UserRound, WalletCards,
} from 'lucide-react';
import { apiFetch, logout } from '@/lib/api-client';
import { toast } from 'sonner';

const PREF_LABELS = {
  product: { label: 'Product updates', desc: 'New features, tips, and improvements.' },
  community: { label: 'Community notifications', desc: 'Activity from communities and Circle.' },
  favorites: { label: 'Trusted people', desc: 'Requests and private sharing updates.' },
  marketing: { label: 'Occasional offers', desc: 'Promotions, surveys, and partner offers.' },
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState({ product: true, community: true, favorites: true, marketing: false });
  const [emailVerified, setEmailVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const emailPrefs = await apiFetch('/settings/email-prefs');
    setPrefs(emailPrefs.prefs || prefs);
    setEmailVerified(!!emailPrefs.emailVerified);
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function toggle(key) {
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const response = await apiFetch('/settings/email-prefs', {
        method: 'PUT',
        body: JSON.stringify({ [key]: next[key] }),
      });
      setPrefs(response.prefs || next);
      toast.success(`${PREF_LABELS[key].label} ${next[key] ? 'enabled' : 'disabled'}`);
    } catch (error) {
      setPrefs(previous);
      toast.error(error?.message || 'Could not update this setting.');
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
    } catch (error) {
      toast.error(error?.message || 'Verification email could not be sent.');
    } finally {
      setResending(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await apiFetch('/auth/delete-account', { method: 'POST' });
      toast.success('Your account and data have been permanently deleted.');
      logout();
    } catch (error) {
      toast.error(error?.message || 'Account deletion failed.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return <div className="mx-auto max-w-4xl space-y-6 pb-32 md:pb-12">
    <header className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5"><Settings2 className="h-5 w-5 text-pink-200" /></div><div><p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">More</p><h1 className="mt-1 text-3xl font-black">Settings</h1></div></div>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48">Control notifications, account access and account-level actions here. Profile, plan, storage, privacy and integrations each have their own dedicated surface.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ControlLink href="/profile" icon={UserRound} title="You / Profile" copy="Identity and account overview" />
      <ControlLink href="/plan-storage" icon={WalletCards} title="Plan & storage" copy="Plan, capacity and backup controls" />
      <ControlLink href="/privacy-security" icon={Shield} title="Privacy & security" copy="Face privacy, consent and deletion" />
      <ControlLink href="/integrations" icon={IntegrationsIcon} title="Integrations" copy="App and cloud authorization" />
      <ControlLink href="/support" icon={LifeBuoy} title="Help & support" copy="Get help when you need it" />
    </section>

    <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
      <h2 className="font-black">Account security</h2>
      <p className="mt-1 text-sm text-white/42">Keep access to your memories protected.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] p-4">
        <div>{emailVerified ? <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-200"><CheckCircle2 className="h-4 w-4" />Email verified</div> : <><div className="text-sm font-bold">Verify your email</div><div className="mt-1 text-xs text-white/42">Verification protects account recovery.</div></>}</div>
        {!emailVerified && <button onClick={resendVerify} disabled={resending} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-black text-black disabled:opacity-60">{resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Resend email</button>}
      </div>
    </section>

    <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
      <h2 className="font-black">Notifications & email</h2>
      <p className="mt-1 text-sm text-white/42">Security and account-recovery messages remain enabled regardless of these preferences.</p>
      <div className="mt-4 divide-y divide-white/5">
        {Object.entries(PREF_LABELS).map(([key, meta]) => <div key={key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{meta.label}</h3><p className="mt-1 text-xs leading-5 text-white/40">{meta.desc}</p></div><button type="button" onClick={() => toggle(key)} aria-pressed={!!prefs[key]} aria-label={`Toggle ${meta.label}`} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${prefs[key] ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/15'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${prefs[key] ? 'left-6' : 'left-1'}`} /></button></div>)}
      </div>
    </section>

    <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
      <h2 className="font-black">Account actions</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={logout} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-bold text-white/70"><LogOut className="h-4 w-4" />Sign out</button>
        <button onClick={() => setConfirmDelete(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-4 text-sm font-bold text-rose-100"><Trash2 className="h-4 w-4" />Delete account</button>
      </div>
      {confirmDelete && <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/[0.08] p-4"><p className="text-sm font-black text-rose-50">Permanently delete your SnapNext account?</p><p className="mt-1 text-xs leading-5 text-rose-100/60">This is separate from deleting face-recognition data. Account deletion removes the entire account according to the account-deletion process.</p><div className="mt-4 flex gap-2"><button disabled={deleting} onClick={deleteAccount} className="rounded-full bg-rose-200 px-4 py-2 text-xs font-black text-rose-950 disabled:opacity-60">{deleting ? 'Deleting…' : 'Delete permanently'}</button><button disabled={deleting} onClick={() => setConfirmDelete(false)} className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-white/70">Cancel</button></div></div>}
    </section>
  </div>;
}

function ControlLink({ href, icon: Icon, title, copy }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.055]"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/5"><Icon className="h-5 w-5 text-pink-200" /></div><div className="min-w-0 flex-1"><h2 className="text-sm font-black">{title}</h2><p className="mt-1 text-xs text-white/42">{copy}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-1" /></Link>;
}
