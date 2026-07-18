'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Heart, LockKeyhole, Loader2, Pencil, Sparkles, X } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { faceCropStyle } from '@/lib/people-intelligence';
import { toast } from 'sonner';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_KEY = 'snapnext.magicPersonProfiles.v1';

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); } catch { return {}; }
}

export default function PeopleRow({ people, enabledNames, favoriteNames, activePerson, displayName, onRename, onOpen }) {
  const [limit, setLimit] = useState(Math.max(4, enabledNames.length));
  const [selected, setSelected] = useState(null);
  const [profiles, setProfiles] = useState({});

  useEffect(() => {
    setProfiles(loadProfiles());
    let cancelled = false;
    apiFetch('/magic-library/activation')
      .then((state) => { if (!cancelled) setLimit(Number(state?.limit || 4)); })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [enabledNames.length]);

  const orderedPeople = useMemo(() => [...people].sort((a, b) => {
    const aEnabled = enabledNames.includes(a.name) ? 1 : 0;
    const bEnabled = enabledNames.includes(b.name) ? 1 : 0;
    return bEnabled - aEnabled || Number(b.count || 0) - Number(a.count || 0);
  }), [people, enabledNames]);

  function saveProfile(name, patch) {
    const next = { ...profiles, [name]: { ...(profiles[name] || {}), ...patch } };
    setProfiles(next);
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch {}
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-xl font-black text-white">People</h2><p className="text-xs text-white/40">Tap any face to view, edit or activate it.</p></div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-black text-white/65">Active {enabledNames.length}/{limit}</span>
      </div>

      <div className="flex snap-x gap-4 overflow-x-auto pb-3 pr-8 [mask-image:linear-gradient(to_right,black_94%,transparent)]">
        {orderedPeople.map((person) => {
          const enabled = enabledNames.includes(person.name);
          const profile = profiles[person.name] || {};
          const label = profile.name || cleanLabel(person, displayName);
          const crop = adjustedCrop(person.representativeFaceBox, profile);
          return <button key={person.name} onClick={() => setSelected({ person, enabled })} className="w-[6.25rem] shrink-0 snap-start text-center" aria-label={`${label}, ${person.count} memories`}>
            <span className={`relative mx-auto block h-24 w-24 overflow-hidden rounded-full border-[3px] bg-white/5 shadow-lg shadow-black/30 ${activePerson === person.name ? 'border-pink-400 ring-4 ring-pink-500/20' : enabled ? 'border-white/25' : 'border-white/10'}`}>
              {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className={`h-full w-full object-cover ${enabled ? '' : 'opacity-75'}`} style={crop} /> : <span className="grid h-full w-full place-items-center font-black text-white/60">?</span>}
              {favoriteNames.includes(person.name) && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-pink-500"><Heart className="h-3.5 w-3.5 fill-current" /></span>}
              {!enabled && <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/80"><LockKeyhole className="h-3 w-3" /></span>}
            </span>
            <span className="mt-2 block truncate text-xs font-bold text-white/75">{label}</span>
            <span className="block text-[10px] text-white/35">{person.count} memories</span>
          </button>;
        })}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-white/35"><Sparkles className="h-3 w-3 text-pink-200/70" />You can always edit a face. Opening all related photos follows your plan.</div>

      {selected && <PersonDialog person={selected.person} enabled={selected.enabled} limit={limit} activeCount={enabledNames.length} profile={profiles[selected.person.name] || {}} label={(profiles[selected.person.name] || {}).name || cleanLabel(selected.person, displayName)} onSave={(patch) => saveProfile(selected.person.name, patch)} onClose={() => setSelected(null)} onOpen={() => { setSelected(null); onOpen(selected.person.name); }} />}
    </section>
  );
}

function cleanLabel(person, displayName) {
  const local = displayName ? displayName(person.name) : '';
  const safeLocal = UUID_PATTERN.test(String(local || '')) ? '' : local;
  const safeDisplay = UUID_PATTERN.test(String(person.displayName || '')) ? '' : person.displayName;
  return safeDisplay && safeDisplay !== 'Add name' ? safeDisplay : (safeLocal && !safeLocal.includes('-') ? safeLocal : 'Add name');
}

function adjustedCrop(box, profile) {
  const base = faceCropStyle(box || {});
  const x = Number(profile.x ?? 50);
  const y = Number(profile.y ?? 50);
  const zoom = Number(profile.zoom ?? 1);
  return { ...base, objectPosition: `${x}% ${y}%`, transform: `${base.transform} scale(${zoom})` };
}

function PersonDialog({ person, enabled, limit, activeCount, profile, label, onSave, onClose, onOpen }) {
  const [name, setName] = useState(label === 'Add name' ? '' : label);
  const [x, setX] = useState(Number(profile.x ?? 50));
  const [y, setY] = useState(Number(profile.y ?? 50));
  const [zoom, setZoom] = useState(Number(profile.zoom ?? 1));
  const [busy, setBusy] = useState(false);
  const canActivate = activeCount < limit;
  const previewStyle = adjustedCrop(person.representativeFaceBox, { x, y, zoom });

  function save() {
    onSave({ name: name.trim() || 'Add name', x, y, zoom });
    toast.success('Person details saved');
  }

  async function activate() {
    setBusy(true);
    try {
      const state = await apiFetch('/magic-library/activation');
      await apiFetch('/magic-library/activation', { method: 'POST', body: JSON.stringify({ people: [...(state.active || []), person.name] }) });
      save();
      toast.success('Person activated');
      window.location.reload();
    } catch (error) { toast.error(error?.message || 'Could not activate this person'); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur" onClick={onClose}>
    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0414] p-5" onClick={(e) => e.stopPropagation()}>
      <button onClick={onClose} className="absolute right-4 top-4 text-white/50"><X className="h-5 w-5" /></button>
      <div className="flex items-center gap-4">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full border-4 border-pink-400/50 bg-white/5">{person.representativeMediaId && <img src={mediaSrc(person.representativeMediaId)} alt="" className="h-full w-full object-cover" style={previewStyle} />}</div>
        <div><h2 className="text-2xl font-black text-white">{name || 'Name this person'}</h2><p className="mt-1 text-sm text-white/50">{person.count || 0} related photos</p><p className="mt-2 text-xs text-white/35">Editing is always available. Opening the complete person search follows your plan.</p></div>
      </div>

      <label className="mt-5 block text-xs font-black uppercase tracking-wider text-white/45">Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add name" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none" />
      <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <p className="flex items-center gap-2 text-sm font-black text-white"><Pencil className="h-4 w-4" />Center the face</p>
        <Slider label="Left / right" value={x} setValue={setX} min={0} max={100} />
        <Slider label="Up / down" value={y} setValue={setY} min={0} max={100} />
        <Slider label="Zoom" value={zoom} setValue={setZoom} min={0.8} max={1.8} step={0.05} />
      </div>
      <button onClick={save} className="mt-4 w-full rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-black text-white">Save face and details</button>
      {enabled ? <button onClick={onOpen} className="mt-3 w-full rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white">View all {person.count || 0} photos</button> : canActivate ? <button onClick={activate} disabled={busy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Activate and view photos</button> : <Link href="/billing" className="mt-3 flex w-full items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white">Upgrade to open this person</Link>}
    </div>
  </div>;
}

function Slider({ label, value, setValue, min, max, step = 1 }) {
  return <label className="block"><span className="mb-1 flex justify-between text-xs text-white/50"><span>{label}</span><span>{Number(value).toFixed(step < 1 ? 2 : 0)}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-pink-500" /></label>;
}
