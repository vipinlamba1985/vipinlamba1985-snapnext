'use client';

import { useEffect, useState } from 'react';
import { Heart, LockKeyhole, Pencil, Sparkles } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { personThumbnailStyle } from '@/lib/people-intelligence';

export default function PeopleRow({ people, enabledNames, favoriteNames, activePerson, displayName, onEditProfile }) {
  const [limit, setLimit] = useState(Math.max(4, enabledNames.length));

  useEffect(() => {
    let cancelled = false;
    apiFetch('/magic-library/activation')
      .then((state) => { if (!cancelled) setLimit(Number(state?.limit || 4)); })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [enabledNames.length]);

  const active = people.filter((person) => enabledNames.includes(person.name));
  const discovered = people.filter((person) => !enabledNames.includes(person.name));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-lg font-black text-white">People</h2><p className="text-xs text-white/40">Tap any face to edit the photo, name or private details.</p></div>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-black text-white/65">Active {active.length}/{limit}</span>
      </div>
      {!!active.length && <div><div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-pink-200/65"><Sparkles className="h-3 w-3" /> Active people</div><div className="flex gap-3 overflow-x-auto pb-1">{active.map((person) => <PersonTile key={person.name} person={person} enabled favoriteNames={favoriteNames} activePerson={activePerson} displayName={displayName} onEditProfile={onEditProfile} />)}</div></div>}
      {!!discovered.length && <div><div className="mb-2 flex items-center justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Discovered · {discovered.length}</div><div className="text-[10px] text-white/30">Profile editing is free</div></div><div className="flex gap-3 overflow-x-auto pb-1">{discovered.map((person) => <PersonTile key={person.name} person={person} enabled={false} favoriteNames={favoriteNames} activePerson={activePerson} displayName={displayName} onEditProfile={onEditProfile} />)}</div></div>}
    </section>
  );
}

function PersonTile({ person, enabled, favoriteNames, activePerson, displayName, onEditProfile }) {
  const favorite = favoriteNames.includes(person.name);
  const selected = activePerson === person.name;
  const localLabel = displayName ? displayName(person.name) : '';
  const label = person.displayName && person.displayName !== 'Add name' ? person.displayName : (localLabel && !localLabel.includes('-') ? localLabel : 'Add name');
  const crop = personThumbnailStyle(person);

  return (
    <div className="w-16 shrink-0 text-center">
      <button onClick={() => onEditProfile(person)} className="block w-full">
        <span className={`relative mx-auto block h-14 w-14 overflow-hidden rounded-full border-2 bg-white/5 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : enabled ? 'border-white/25' : 'border-white/10'}`}>
          {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className={`h-full w-full object-cover ${enabled ? '' : 'opacity-75'}`} style={crop} /> : <span className="grid h-full w-full place-items-center font-black text-white/60">?</span>}
          {favorite && <span className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-full bg-pink-500 text-white"><Heart className="h-3 w-3 fill-current" /></span>}
          {!enabled && <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-black/75 text-white/70"><LockKeyhole className="h-2.5 w-2.5" /></span>}
        </span>
      </button>
      <button onClick={() => onEditProfile(person)} className="mt-1.5 inline-flex max-w-full items-center justify-center gap-1 text-[11px] font-bold text-white/70"><span className="truncate">{label}</span><Pencil className="h-2.5 w-2.5 text-white/30" /></button>
      <span className="block text-[9px] text-white/30">{person.count} memories</span>
    </div>
  );
}
