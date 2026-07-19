'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Check, Heart, HelpCircle, LockKeyhole, Loader2, Pencil, Sparkles, UserX, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import PeopleFaceThumbnail from '@/components/magic-library/PeopleFaceThumbnail';
import { toast } from 'sonner';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_KEY = 'snapnext.magicPersonProfiles.v2';
function loadProfiles() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); } catch { return {}; } }

export default function PeopleRow({ people, enabledNames, favoriteNames, activePerson, displayName, onOpen }) {
  const [limit, setLimit] = useState(Math.max(4, enabledNames.length));
  const [selected, setSelected] = useState(null);
  const [profiles, setProfiles] = useState({});

  useEffect(() => {
    setProfiles(loadProfiles());
    let cancelled = false;
    apiFetch('/magic-library/activation').then((state) => { if (!cancelled) setLimit(Number(state?.limit || 4)); }).catch(() => null);
    return () => { cancelled = true; };
  }, [enabledNames.length]);

  const orderedPeople = useMemo(() => [...people].sort((a, b) => {
    const aReview = a.verificationStatus === 'suggested' ? 1 : 0;
    const bReview = b.verificationStatus === 'suggested' ? 1 : 0;
    const aEnabled = enabledNames.includes(a.name) ? 1 : 0;
    const bEnabled = enabledNames.includes(b.name) ? 1 : 0;
    return bReview - aReview || bEnabled - aEnabled || Number(b.count || 0) - Number(a.count || 0);
  }), [people, enabledNames]);

  function saveCrop(name, patch) {
    const next = { ...profiles, [name]: { ...(profiles[name] || {}), ...patch } };
    setProfiles(next);
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch {}
  }

  return <section className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-xl font-black text-white">People</h2><p className="text-xs text-white/40">Clean v3 identities show one centered face per person.</p></div>
      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-black text-white/65">Active {enabledNames.length}/{limit}</span>
    </div>
    <div className="flex snap-x gap-4 overflow-x-auto pb-3 pr-8 [mask-image:linear-gradient(to_right,black_94%,transparent)]">
      {orderedPeople.map((person) => {
        const enabled = enabledNames.includes(person.name);
        const profile = profiles[person.name] || {};
        const label = cleanLabel(person, displayName);
        return <button key={person.name} onClick={() => setSelected({ person, enabled })} className="w-[6.25rem] shrink-0 snap-start text-center" aria-label={`${label}, ${person.count} memories`}>
          <span className={`relative mx-auto block h-24 w-24 overflow-hidden rounded-full border-[3px] bg-white/5 shadow-lg shadow-black/30 ${activePerson === person.name ? 'border-pink-400 ring-4 ring-pink-500/20' : person.verificationStatus === 'suggested' ? 'border-amber-300/70' : enabled ? 'border-white/25' : 'border-white/10'}`}>
            <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} manual={profile} className={`h-full w-full ${enabled ? '' : 'opacity-75'}`} />
            {favoriteNames.includes(person.name) && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-pink-500"><Heart className="h-3.5 w-3.5 fill-current" /></span>}
            {person.verificationStatus === 'suggested' ? <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-black"><HelpCircle className="h-3.5 w-3.5" /></span> : !enabled && <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/80"><LockKeyhole className="h-3 w-3" /></span>}
          </span>
          <span className="mt-2 block truncate text-xs font-bold text-white/75">{label}</span>
          <span className="block text-[10px] text-white/35">{person.verificationStatus === 'suggested' ? 'Needs confirmation' : `${person.count} memories`}</span>
        </button>;
      })}
    </div>
    <div className="flex items-center gap-2 text-[10px] text-white/35"><Sparkles className="h-3 w-3 text-pink-200/70" />Legacy duplicate clusters are excluded while the clean library rebuilds.</div>
    {selected && <PersonDialog {...selected} limit={limit} activeCount={enabledNames.length} profile={profiles[selected.person.name] || {}} label={cleanLabel(selected.person, displayName)} onSaveCrop={(patch) => saveCrop(selected.person.name, patch)} onClose={() => setSelected(null)} onOpen={() => { setSelected(null); onOpen(selected.person.name); }} />}
  </section>;
}

function cleanLabel(person, displayName) {
  const local = displayName ? displayName(person.name) : '';
  const safeLocal = UUID_PATTERN.test(String(local || '')) ? '' : local;
  const safeDisplay = UUID_PATTERN.test(String(person.displayName || '')) ? '' : person.displayName;
  return safeDisplay && safeDisplay !== 'Add name' ? safeDisplay : (safeLocal && !safeLocal.includes('-') ? safeLocal : 'Add name');
}

function PersonDialog({ person, enabled, limit, activeCount, profile, label, onSaveCrop, onClose, onOpen }) {
  const [name, setName] = useState(label === 'Add name' ? '' : label);
  const [x, setX] = useState(Number(profile.x || 0));
  const [y, setY] = useState(Number(profile.y || 0));
  const [zoom, setZoom] = useState(Number(profile.zoom || 1));
  const [busy, setBusy] = useState('');
  const canActivate = activeCount < limit;

  async function save() {
    setBusy('save');
    try {
      const cleanName = name.trim();
      if (cleanName) await apiFetch('/magic-library/people', { method: 'PATCH', body: JSON.stringify({ clusterId: person.name, displayName: cleanName }) });
      onSaveCrop({ x, y, zoom });
      toast.success('Person saved to your SnapNext account');
      window.location.reload();
    } catch (error) { toast.error(error?.message || 'Could not save this person'); }
    finally { setBusy(''); }
  }
  async function review(action) {
    setBusy(action);
    try {
      await apiFetch('/magic-library/people/review', { method: 'POST', body: JSON.stringify({ clusterId: person.name, action }) });
      toast.success(action === 'confirm' ? 'Person confirmed' : action === 'reject' ? 'Match rejected' : 'Person hidden');
      window.location.reload();
    } catch (error) { toast.error(error?.message || 'Could not update this person'); }
    finally { setBusy(''); }
  }
  async function activate() {
    setBusy('activate');
    try {
      const state = await apiFetch('/magic-library/activation');
      await apiFetch('/magic-library/activation', { method: 'POST', body: JSON.stringify({ people: [...new Set([...(state.active || []), person.name])] }) });
      toast.success('Person activated');
      window.location.reload();
    } catch (error) { toast.error(error?.message || 'Could not activate this person'); }
    finally { setBusy(''); }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur" onClick={onClose}>
    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0414] p-5" onClick={(e) => e.stopPropagation()}>
      <button onClick={onClose} className="absolute right-4 top-4 text-white/50"><X className="h-5 w-5" /></button>
      <div className="flex items-center gap-4"><PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} manual={{ x, y, zoom }} className="h-28 w-28 shrink-0 rounded-full border-4 border-pink-400/50" /><div><h2 className="text-2xl font-black text-white">{name || 'Name this person'}</h2><p className="mt-1 text-sm text-white/50">{person.count || 0} related photos</p>{person.verificationStatus === 'suggested' && <p className="mt-2 text-xs font-bold text-amber-200">SnapNext is {Number(person.bestSimilarity || 0).toFixed(1)}% confident. Please confirm.</p>}</div></div>
      {person.verificationStatus === 'suggested' && <div className="mt-5 grid grid-cols-3 gap-2"><button onClick={() => review('confirm')} disabled={busy} className="rounded-xl bg-emerald-500/15 p-3 text-xs font-black text-emerald-200"><Check className="mx-auto mb-1 h-4 w-4" />Correct</button><button onClick={() => review('reject')} disabled={busy} className="rounded-xl bg-amber-500/15 p-3 text-xs font-black text-amber-200"><UserX className="mx-auto mb-1 h-4 w-4" />Not same</button><button onClick={() => review('hide')} disabled={busy} className="rounded-xl bg-white/5 p-3 text-xs font-black text-white/55"><X className="mx-auto mb-1 h-4 w-4" />Hide</button></div>}
      <label className="mt-5 block text-xs font-black uppercase tracking-wider text-white/45">Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add name" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none" />
      <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="flex items-center gap-2 text-sm font-black text-white"><Pencil className="h-4 w-4" />Fine-tune face</p><Slider label="Left / right" value={x} setValue={setX} min={-50} max={50} /><Slider label="Up / down" value={y} setValue={setY} min={-50} max={50} /><Slider label="Zoom" value={zoom} setValue={setZoom} min={0.8} max={1.35} step={0.05} /></div>
      <button onClick={save} disabled={Boolean(busy)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}Save person</button>
      {enabled ? <button onClick={onOpen} className="mt-3 w-full rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white">View all {person.count || 0} photos</button> : canActivate ? <button onClick={activate} disabled={Boolean(busy)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy === 'activate' && <Loader2 className="h-4 w-4 animate-spin" />}Activate and view photos</button> : <Link href="/billing" className="mt-3 flex w-full items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white">Upgrade to open this person</Link>}
    </div>
  </div>;
}
function Slider({ label, value, setValue, min, max, step = 1 }) { return <label className="block"><span className="mb-1 flex justify-between text-xs text-white/50"><span>{label}</span><span>{Number(value).toFixed(step < 1 ? 2 : 0)}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-pink-500" /></label>; }
