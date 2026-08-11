'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cloud, Heart, Loader2, Plus, ShieldCheck, UserRoundCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import PeopleFaceThumbnail from '@/components/magic-library/PeopleFaceThumbnail';
import { publishLibraryRefresh } from '@/lib/library-refresh';
import { isUnknownPerson } from '@/lib/people-identity';

function personLabel(person = {}) {
  if (person.isSelf) return 'You';
  const value = String(person.displayName || '').trim();
  return value && value !== 'Add name' ? value : 'Name this person';
}

export default function FavoritePeoplePanel({ people = [] }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState('');
  const [enrollTarget, setEnrollTarget] = useState('');

  async function load() {
    const next = await apiFetch('/magic-library/favorite-people');
    setState(next);
    setEnrollTarget((current) => {
      if (current && next.selected?.some((person) => person.clusterId === current && !person.enrolled)) return current;
      return next.selected?.find((person) => !person.enrolled)?.clusterId || '';
    });
  }

  useEffect(() => { load().catch(() => setState({ planId: 'free', limit: 0, selected: [], candidates: [], cloudReady: false })); }, []);

  const selectedIds = useMemo(() => new Set((state?.selected || []).map((person) => person.clusterId)), [state?.selected]);
  const selectable = useMemo(() => people.filter((person) => {
    if (!person?.name || selectedIds.has(person.name) || isUnknownPerson(person)) return false;
    return person.isSelf || (person.displayName && person.displayName !== 'Add name');
  }).slice(0, 12), [people, selectedIds]);
  const remaining = Math.max(0, Number(state?.limit || 0) - Number(state?.selected?.length || 0));
  const unenrolled = (state?.selected || []).filter((person) => !person.enrolled);

  async function mutate(key, request, success) {
    setBusy(key);
    try {
      const next = await apiFetch('/magic-library/favorite-people', request);
      setState(next);
      setEnrollTarget(next.selected?.find((person) => !person.enrolled)?.clusterId || '');
      toast.success(success);
      publishLibraryRefresh({ source: 'favorite-people' });
    } catch (error) {
      toast.error(error?.message || 'Favourite People could not be updated');
    } finally {
      setBusy('');
    }
  }

  async function selectPerson(person) {
    await mutate(`select:${person.name}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'select', clusterId: person.name }),
    }, `${personLabel(person)} added to Favourite People`);
  }

  async function removePerson(person) {
    if (!window.confirm(`Remove ${person.displayName || 'this person'} from automatic Favourite People recognition? Their photos are not deleted.`)) return;
    await mutate(`remove:${person.clusterId}`, {
      method: 'DELETE',
      body: JSON.stringify({ clusterId: person.clusterId }),
    }, 'Favourite Person removed from cloud recognition');
  }

  async function enrollFromPhoto(candidate, clusterId = '') {
    let displayName = '';
    if (!clusterId) {
      displayName = String(window.prompt('Name this Favourite Person (for example Mom, Dad, Partner)') || '').trim();
      if (!displayName) return;
    }
    await mutate(`enroll:${candidate.mediaId}:${clusterId || 'new'}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'enroll', mediaId: candidate.mediaId, clusterId, displayName }),
    }, 'Favourite Person reference enrolled');
  }

  if (!state) return <div className="flex min-h-24 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]"><Loader2 className="h-5 w-5 animate-spin text-pink-300" /></div>;

  if (Number(state.limit || 0) <= 0) {
    return <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/[0.08] to-purple-500/[0.05] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-pink-500/15 text-pink-200"><Heart className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black text-white">Favourite People</h2><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black text-white/45">Local only</span></div>
          <p className="mt-1 text-xs leading-5 text-white/50">Local face detection can still organize safely on this plan. Automatic cloud matching for chosen people starts on Starter.</p>
          <Link href="/plan-storage" className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black">See plans</Link>
        </div>
      </div>
    </section>;
  }

  return <section className="space-y-4 rounded-3xl border border-pink-300/15 bg-gradient-to-br from-pink-500/[0.09] via-purple-500/[0.06] to-cyan-400/[0.04] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-pink-500/15 text-pink-200"><Heart className="h-5 w-5 fill-current" /></span>
        <div>
          <h2 className="font-black text-white">Favourite People</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-white/50">Cloud matching is limited to the people you choose here. Other faces are ignored and never added automatically.</p>
        </div>
      </div>
      <span className="rounded-full border border-pink-300/20 bg-pink-300/10 px-3 py-1.5 text-[11px] font-black text-pink-100">{state.selected?.length || 0}/{state.limit} selected</span>
    </div>

    <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-[11px] leading-5 text-emerald-100/80">
      <ShieldCheck className="h-4 w-4 shrink-0" />Ordinary-photo face vectors are temporary. SnapNext retains cloud references only for the Favourite People you explicitly enrol.
    </div>

    {(state.selected || []).length > 0 && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {(state.selected || []).map((person) => <div key={person.clusterId} className={`flex items-center gap-3 rounded-2xl border p-3 ${person.enrolled ? 'border-emerald-300/15 bg-emerald-300/[0.05]' : enrollTarget === person.clusterId ? 'border-amber-300/25 bg-amber-300/[0.07]' : 'border-white/10 bg-black/15'}`}>
        <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} className="h-12 w-12 shrink-0 rounded-xl" />
        <button type="button" onClick={() => !person.enrolled && setEnrollTarget(person.clusterId)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-black text-white">{person.displayName}</span>
          <span className={`mt-0.5 block text-[10px] font-bold ${person.enrolled ? 'text-emerald-200' : 'text-amber-200'}`}>{person.enrolled ? 'Cloud reference ready' : 'Needs a solo reference photo'}</span>
        </button>
        <button type="button" onClick={() => removePerson(person)} disabled={busy === `remove:${person.clusterId}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/50" aria-label={`Remove ${person.displayName}`}>
          {busy === `remove:${person.clusterId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      </div>)}
    </div>}

    {remaining > 0 && selectable.length > 0 && <div>
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Choose from your People</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {selectable.map((person) => <button key={person.name} type="button" onClick={() => selectPerson(person)} disabled={Boolean(busy)} className="flex min-w-28 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-2 text-left active:scale-[0.98]">
          <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} className="h-10 w-10 shrink-0 rounded-xl" />
          <span className="min-w-0"><span className="block max-w-24 truncate text-xs font-black text-white">{personLabel(person)}</span><span className="mt-0.5 flex items-center gap-1 text-[9px] text-pink-200"><Plus className="h-2.5 w-2.5" />Favourite</span></span>
        </button>)}
      </div>
    </div>}

    {remaining > 0 && !selectable.length && !state.candidates?.length && <p className="rounded-2xl border border-white/10 bg-black/15 p-3 text-xs leading-5 text-white/45">Once SnapNext has a clear solo photo, you can choose that person here. No one is sent to cloud recognition automatically.</p>}

    {state.candidates?.length > 0 && (remaining > 0 || unenrolled.length > 0) && <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Solo reference photos</p>
        {!state.cloudReady && <Link href="/privacy-security" className="text-[10px] font-black text-pink-200">Enable in Privacy & security</Link>}
      </div>
      {unenrolled.length > 0 && <p className="mb-2 text-[11px] text-amber-100/70">Choose the correct solo photo for <strong>{state.selected.find((person) => person.clusterId === enrollTarget)?.displayName || 'your selected Favourite Person'}</strong>.</p>}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {state.candidates.slice(0, 8).map((candidate) => <button key={candidate.mediaId} type="button" disabled={!state.cloudReady || Boolean(busy)} onClick={() => enrollFromPhoto(candidate, enrollTarget || '')} className="group overflow-hidden rounded-xl border border-white/10 bg-white/5 disabled:opacity-40">
          <PeopleFaceThumbnail mediaId={candidate.mediaId} className="aspect-square w-full" />
          <span className="flex min-h-8 items-center justify-center gap-1 px-1 text-[9px] font-black text-white/65"><UserRoundCheck className="h-3 w-3" />Use</span>
        </button>)}
      </div>
    </div>}

    <div className="flex items-center gap-2 text-[10px] leading-4 text-white/35"><Cloud className="h-3.5 w-3.5 shrink-0" />0-face photos and 5+ face group photos never enter automatic Favourite People matching.</div>
  </section>;
}
