'use client';

import { useEffect, useState } from 'react';
import { Heart, LockKeyhole, Pencil, Sparkles } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { faceCropStyle } from '@/lib/people-intelligence';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function PeopleRow({ people, enabledNames, favoriteNames, activePerson, displayName, onRename, onOpen, onLocked }) {
  const [limit, setLimit] = useState(Math.max(4, enabledNames.length));

  useEffect(() => {
    let cancelled = false;
    apiFetch('/magic-library/activation')
      .then((state) => { if (!cancelled) setLimit(Number(state?.limit || 4)); })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [enabledNames.length]);

  const orderedPeople = [...people].sort((a, b) => {
    const aEnabled = enabledNames.includes(a.name) ? 1 : 0;
    const bEnabled = enabledNames.includes(b.name) ? 1 : 0;
    return bEnabled - aEnabled || Number(b.count || 0) - Number(a.count || 0);
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">People</h2>
          <p className="text-xs text-white/40">Active and discovered faces together. Tap a face to search its memories.</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-black text-white/65">Active {enabledNames.length}/{limit}</span>
      </div>

      <div className="flex snap-x gap-4 overflow-x-auto pb-3 pr-8 [mask-image:linear-gradient(to_right,black_94%,transparent)]">
        {orderedPeople.map((person) => (
          <PersonTile
            key={person.name}
            person={person}
            enabled={enabledNames.includes(person.name)}
            favoriteNames={favoriteNames}
            activePerson={activePerson}
            displayName={displayName}
            onRename={onRename}
            onOpen={onOpen}
            onLocked={onLocked}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-white/35"><Sparkles className="h-3 w-3 text-pink-200/70" />Unlocked faces follow your plan. Discovered faces remain visible and private.</div>
    </section>
  );
}

function PersonTile({ person, enabled, favoriteNames, activePerson, displayName, onRename, onOpen, onLocked }) {
  const favorite = favoriteNames.includes(person.name);
  const selected = activePerson === person.name;
  const localLabel = displayName ? displayName(person.name) : '';
  const safeLocalLabel = UUID_PATTERN.test(String(localLabel || '')) ? '' : localLabel;
  const safeDisplayName = UUID_PATTERN.test(String(person.displayName || '')) ? '' : person.displayName;
  const label = safeDisplayName && safeDisplayName !== 'Add name' ? safeDisplayName : (safeLocalLabel && !safeLocalLabel.includes('-') ? safeLocalLabel : 'Add name');
  const crop = faceCropStyle(person.representativeFaceBox || {});

  return (
    <div className="w-[6.25rem] shrink-0 snap-start text-center">
      <button onClick={() => enabled ? onOpen(person.name) : onLocked(person)} className="block min-h-24 w-full" aria-label={`${label}, ${person.count} memories`}>
        <span className={`relative mx-auto block h-24 w-24 overflow-hidden rounded-full border-[3px] bg-white/5 shadow-lg shadow-black/30 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : enabled ? 'border-white/25' : 'border-white/10'}`}>
          {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className={`h-full w-full object-cover ${enabled ? '' : 'opacity-70'}`} style={crop} /> : <span className="grid h-full w-full place-items-center font-black text-white/60">?</span>}
          {favorite && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-pink-500 text-white"><Heart className="h-3.5 w-3.5 fill-current" /></span>}
          {!enabled && <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-black/80 text-white/75"><LockKeyhole className="h-3 w-3" /></span>}
        </span>
      </button>
      <button onClick={() => onRename?.(person.name)} className="mt-1 inline-flex min-h-10 w-full items-center justify-center gap-1 px-1 text-xs font-bold text-white/75" aria-label={`Rename ${label}`}><span className="line-clamp-2 leading-4">{label}</span>{enabled && <Pencil className="h-3.5 w-3.5 shrink-0 text-white/40" />}</button>
      <span className="block text-[10px] text-white/35">{person.count} memories</span>
    </div>
  );
}
