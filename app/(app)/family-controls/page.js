'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Baby, Check, Loader2, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function FamilySafetyPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');

  async function load() {
    try { setData(await apiFetch('/family-safety/status')); }
    catch (error) { toast.error(error.message || 'Could not load Family Safety.'); }
  }

  useEffect(() => { load(); }, []);

  async function createProfile() {
    if (!name || !birthDate) return;
    setBusy('create');
    try {
      await apiFetch('/family-safety/profiles', { method: 'POST', body: JSON.stringify({ displayName: name, birthDate }) });
      setName(''); setBirthDate(''); await load(); toast.success('Child profile created in protected draft mode.');
    } catch (error) { toast.error(error.message || 'Could not create profile.'); }
    finally { setBusy(''); }
  }

  async function promptAction(profile, action, payload, success) {
    setBusy(`${profile.id}:${action}`);
    try { await apiFetch(`/family-safety/profiles/${profile.id}/${action}`, { method: 'POST', body: JSON.stringify(payload) }); await load(); toast.success(success); }
    catch (error) { toast.error(error.message || 'Action failed.'); }
    finally { setBusy(''); }
  }

  if (!data) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/50" /></div>;

  return (
    <div className="space-y-6 pb-16">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-200"><ShieldCheck className="h-4 w-4" /> Family Controls</div>
        <h1 className="mt-3 text-3xl font-black">Parent-managed minor accounts</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Create protected child profiles, record guardian consent, approve trusted contacts and communities, and review safety activity. Minor social access stays disabled until legal review and the production feature flag are complete.</p>
      </header>

      {!data.featureEnabled && <div className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5"><div className="font-black text-amber-100">Protected legal-hold mode</div><p className="mt-2 text-sm leading-6 text-amber-50/70">The code is installed, but minor accounts cannot become active while <code>MINOR_ACCOUNTS_ENABLED</code> is off. This prevents accidental launch before consent documents, age assurance, privacy review and operating procedures are approved.</p></div>}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-black">Create a protected child profile</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto]"><input value={name} onChange={e => setName(e.target.value)} placeholder="Child display name" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" /><input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" /><button onClick={createProfile} disabled={busy === 'create'} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-40">{busy === 'create' ? 'Creating…' : 'Create profile'}</button></div>
      </section>

      <section className="space-y-4">
        {data.profiles.map(profile => <div key={profile.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-500/15"><Baby className="h-5 w-5 text-purple-200" /></div><div><h2 className="font-black">{profile.displayName}</h2><p className="mt-1 text-xs text-white/45">{profile.ageBand} · {profile.controlMode} · status: {profile.status}</p></div></div><span className={`rounded-full px-3 py-1 text-xs font-black ${profile.consent ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-100'}`}>{profile.consent ? 'Consent recorded' : 'Consent required'}</span></div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <button onClick={() => { const email = window.prompt('Minor SnapNext account email'); if (email) promptAction(profile, 'link-account', { email }, 'Minor account linked.'); }} className="rounded-2xl border border-white/10 p-3 text-left text-sm font-bold">Link child account</button>
            <button onClick={() => { const email = window.prompt('Trusted family or friend email'); if (email) promptAction(profile, 'trusted-contact', { email }, 'Trusted contact approved.'); }} className="rounded-2xl border border-white/10 p-3 text-left text-sm font-bold"><UserPlus className="mb-2 h-4 w-4" />Approve trusted contact</button>
            <button onClick={() => promptAction(profile, 'consent', { consentVersion: 'family-safety-v1', method: 'guardian_account_confirmation', relationship: 'parent_or_legal_guardian' }, 'Guardian consent recorded.')} className="rounded-2xl border border-white/10 p-3 text-left text-sm font-bold"><Check className="mb-2 h-4 w-4" />Record guardian consent</button>
            <button onClick={() => { if (window.confirm('Withdraw consent and suspend this minor profile?')) promptAction(profile, 'withdraw-consent', {}, 'Consent withdrawn and profile suspended.'); }} className="rounded-2xl border border-rose-400/20 p-3 text-left text-sm font-bold text-rose-200"><XCircle className="mb-2 h-4 w-4" />Withdraw consent</button>
          </div>

          <div className="mt-4 rounded-2xl bg-black/15 p-4 text-xs leading-5 text-white/50">Public profile, public communities, unknown contacts, behavioural advertising and data sale are permanently disabled for minor profiles. Face recognition and location sharing remain off unless separately approved through a future legally reviewed consent flow.</div>
        </div>)}
        {!data.profiles.length && <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">No child profiles yet.</div>}
      </section>

      {!!data.pendingChats?.length && <section className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5"><h2 className="font-black">Chat requests awaiting guardian approval</h2><div className="mt-4 space-y-2">{data.pendingChats.map(thread => { const profile = data.profiles.find(item => item.userId === thread.requestSenderId); return <div key={thread.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/15 p-3"><div><div className="text-sm font-bold">{profile?.displayName || 'Minor account'} wants to connect with {thread.members?.find(member => member.id === thread.requestRecipientId)?.name || 'another member'}</div><div className="mt-1 text-xs text-white/40">The other user must still accept after guardian approval.</div></div>{profile && <button onClick={() => promptAction(profile, 'approve-chat', { threadId: thread.id }, 'Chat request approved by guardian.')} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">Approve request</button>}</div>; })}</div></section>}
    </div>
  );
}
