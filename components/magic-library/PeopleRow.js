'use client';

import { Heart, Pencil } from 'lucide-react';
import { mediaSrc } from '@/lib/api-client';

export default function PeopleRow({ people, enabledNames, favoriteNames, activePerson, displayName, onRename, onOpen, onLocked }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-white">People</h2>
        <span className="text-[11px] text-white/35">Tap face · edit name</span>
      </div>
      <div className="mt-2.5 flex gap-3 overflow-x-auto pb-1">
        {people.map((person) => {
          const enabled = enabledNames.includes(person.name);
          const favorite = favoriteNames.includes(person.name);
          const selected = activePerson === person.name;
          const label = displayName ? displayName(person.name) : person.name;
          return (
            <div key={person.name} className="w-16 shrink-0 text-center">
              <button onClick={() => enabled ? onOpen(person.name) : onLocked(person)} className="block w-full">
                <span className={`relative mx-auto block h-14 w-14 overflow-hidden rounded-full border-2 bg-white/5 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : enabled ? 'border-white/25' : 'border-white/10 opacity-55'}`}>
                  {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className="h-full w-full object-cover scale-[2.65] origin-top" style={{ objectPosition: '50% 18%' }} /> : <span className="grid h-full w-full place-items-center font-black text-white/60">{label.slice(0,1).toUpperCase()}</span>}
                  {favorite && <span className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-full bg-pink-500 text-white"><Heart className="h-3 w-3 fill-current" /></span>}
                </span>
              </button>
              <button onClick={() => onRename && onRename(person.name)} className="mt-1 inline-flex max-w-full items-center justify-center gap-0.5 text-[11px] font-bold text-white/70"><span className="truncate">{label}</span><Pencil className="h-2.5 w-2.5 text-white/30" /></button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
