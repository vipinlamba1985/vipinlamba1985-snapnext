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

  const active = people.filter((person) => enabledNames.includes(person.name));
  const discovered = people.filter((person) => !enabledNames.includes(person.name));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">People</h2>
          <p className="text-xs text-white/40">Private face groups from your memories.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-black text-white/65">Active {active.length}/{limit}</span>
      </div>

      {!!active.length && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-pink-200/65"><Sparkles className="h-3 w-3" /> Active people</div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 pr-6 [mask-image:linear-gradient(to_right,black_92%,transparent)]">
            {active.map((person) => <PersonTile key={person.name} person={person} enabled favoriteNames={favoriteNames} activePerson={activePerson} displayName={displayName} onRename={onRename} onOpen={onOpen} onLocked={onLocked} />)}
          </div>
        </div>
      )}

      {!!discovered.length && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Discovered · {discovered.length}</div>
            <div className="text-[10px] text-white/30">Private to your account</div>
          </div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 pr-6 [mask-image:linear-gradient(to_right,black_92%,transparent)]">
            {discovered.map((person) => <PersonTile key={person.name} person={person} enabled={false} favoriteNames={favoriteNames} activePerson={activePerson} displayName={displayName} onRename={onRename} onOpen={onOpen} onLocked={onLocked} />)}
          </div>
        </div>
      )}
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
    <div className="w-[4.75rem] shrink-0 snap-start text-center">
      <button onClick={() => enabled ? onOpen(person.name) : onLocked(person)} className="block min-h-16 w-full" aria-label={`${label}, ${person.count} memories`}>
        <span className={`relative mx-auto block h-16 w-16 overflow-hidden rounded-full border-2 bg-white/5 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : enabled ? 'border-white/25' : 'border-white/10'}`}>
          {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className={`h-full w-full object-cover ${enabled ? '' : 'opacity-65'}`} style={crop} /> : <span className="grid h-full w-full place-items-center font-black text-white/60">?</span>}
          {favorite && <span className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-full bg-pink-500 text-white"><Heart className="h-3 w-3 fill-current" /></span>}
          {!enabled && <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-black/75 text-white/70"><LockKeyhole className="h-2.5 w-2.5" /></span>}
        </span>
      </button>
      <button onClick={() => onRename?.(person.name)} className="mt-1 inline-flex min-h-10 w-full items-center justify-center gap-1 px-1 text-[11px] font-bold text-white/70" aria-label={`Rename ${label}`}><span className="line-clamp-2 leading-4">{label}</span>{enabled && <Pencil className="h-3 w-3 shrink-0 text-white/35" />}</button>
      <span className="block text-[9px] text-white/30">{person.count} memories</span>
    </div>
  );
}
