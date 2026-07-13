'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Crown, Loader2, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

export default function FamilyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'adult', relationship: 'family' });
  const [lastInvite, setLastInvite] = useState('');

  async function load() {
    setLoading(true);
    try { setData(await apiFetch('/family')); }
    catch (error) { toast.error(error.message || 'Family details could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function invite(event) {
    event.preventDefault();
    setSending(true);
    try {
      const result = await apiFetch('/family', { method: 'POST', body: JSON.stringify(form) });
      setLastInvite(result.inviteUrl || '');
      setForm({ email: '', role: 'adult', relationship: 'family' });
      toast.success('Invitation created. Share the secure link with your family member.');
      await load();
    } catch (error) { toast.error(error.message || 'Invitation could not be created.'); }
    finally { setSending(false); }
  }

  async function removeMember(memberUserId) {
    try {
      await apiFetch('/family', { method: 'PATCH', body: JSON.stringify({ action: 'remove_member', memberUserId }) });
      toast.success('Member removed. Their personal library remains theirs.');
      await load();
    } catch (error) { toast.error(error.message || 'Member could not be removed.'); }
  }

  async function cancelInvite(inviteId) {
    try {
      await apiFetch('/family', { method: 'PATCH', body: JSON.stringify({ action: 'cancel_invite', inviteId }) });
      toast.success('Invitation cancelled.');
      await load();
    } catch (error) { toast.error(error.message || 'Invitation could not be cancelled.'); }
  }

  async function leaveFamily() {
    try {
      await apiFetch('/family', { method: 'DELETE' });
      toast.success('You left the family. Your personal library is unchanged.');
      await load();
    } catch (error) { toast.error(error.message || 'You could not leave the family.'); }
  }

  if (loading) return <div className="grid min-h-[45vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-pink-300" /></div>;
  const family = data?.family;

  if (!family) return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-3xl font-black">Family</h1><p className="mt-2 text-white/55">Private personal libraries with one shared household plan.</p></div>
      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <Users className="h-8 w-8 text-cyan-300" />
        <h2 className="mt-4 text-2xl font-bold">{data?.eligible ? 'Create your Family space' : 'Family plan required'}</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">The Family Owner can invite up to five additional members. Nothing is shared automatically; each person controls what enters the Family space.</p>
        {data?.eligible ? <p className="mt-4 text-sm text-emerald-200">Send your first invitation below after the Family space is created automatically.</p> : <Link href="/billing" className="mt-5 inline-flex rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-bold">View Family plan</Link>}
      </section>
      {data?.eligible && <InviteForm form={form} setForm={setForm} invite={invite} sending={sending} />}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-black">{family.name}</h1><p className="mt-2 text-white/55">{family.members.length} of {family.maxMembers} members · private by default</p></div>{family.isOwner ? <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200"><Crown className="h-4 w-4" /> Family Owner</span> : <button onClick={leaveFamily} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/65">Leave family</button>}</div>

      <section className="grid gap-4 md:grid-cols-3">
        <Info title="Shared AI" value="280 credits/week" detail="One household pool; cached intelligence costs 0." />
        <Info title="Shared storage" value="2 TB household vault" detail="Personal items stay private until intentionally shared." />
        <Info title="Privacy" value="Private by default" detail="Joining never exposes an existing personal library." />
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:p-6">
        <h2 className="text-xl font-bold">Members</h2>
        <div className="mt-4 space-y-3">{family.members.map((member) => <div key={member.userId} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-4"><div className="grid h-10 w-10 place-items-center rounded-full bg-purple-500/20 font-bold">{member.name?.[0]?.toUpperCase() || 'F'}</div><div className="min-w-0 flex-1"><div className="font-semibold">{member.name}</div><div className="truncate text-xs text-white/45">{member.email} · {member.role}</div></div>{family.isOwner && member.role !== 'owner' && <button onClick={() => removeMember(member.userId)} className="rounded-full p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>}</div>)}</div>
      </section>

      {family.isOwner && <InviteForm form={form} setForm={setForm} invite={invite} sending={sending} />}

      {lastInvite && <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5"><div className="text-sm font-bold">Secure invitation link</div><div className="mt-3 flex gap-2"><input readOnly value={lastInvite} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs" /><button onClick={() => navigator.clipboard.writeText(lastInvite).then(() => toast.success('Invitation link copied.'))} className="rounded-xl bg-white px-3 text-black"><Copy className="h-4 w-4" /></button></div></section>}

      {family.isOwner && family.invites.length > 0 && <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><h2 className="font-bold">Pending invitations</h2><div className="mt-3 space-y-2">{family.invites.map((invite) => <div key={invite.id} className="flex items-center gap-3 rounded-2xl bg-black/15 p-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{invite.email}</div><div className="text-xs text-white/40">{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</div></div><button onClick={() => cancelInvite(invite.id)} className="text-xs text-rose-300">Cancel</button></div>)}</div></section>}

      <section className="flex gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-5"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" /><p className="text-sm leading-6 text-white/60">Removing or leaving a family never deletes a member's personal photos, videos, albums, or memories. Only Family plan access and deliberately shared items are affected.</p></section>
    </div>
  );
}

function InviteForm({ form, setForm, invite, sending }) {
  return <form onSubmit={invite} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:p-6"><div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-pink-300" /><h2 className="text-xl font-bold">Invite a family member</h2></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_150px_160px_auto]"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="member@example.com" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm" /><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-2xl border border-white/10 bg-[#13081f] px-3 py-3 text-sm"><option value="adult">Adult</option><option value="child">Child</option></select><input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="Relationship" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm" /><button disabled={sending} className="rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-bold disabled:opacity-60">{sending ? 'Creating…' : 'Create invite'}</button></div><p className="mt-3 text-xs text-white/40">The invitation expires after seven days and only works for the invited email address.</p></form>;
}

function Info({ title, value, detail }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><div className="text-xs font-bold uppercase tracking-wider text-white/40">{title}</div><div className="mt-2 text-xl font-black">{value}</div><div className="mt-2 text-xs leading-5 text-white/45">{detail}</div></div>;
}
