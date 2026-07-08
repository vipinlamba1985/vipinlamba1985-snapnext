'use client';

import { Heart, Pencil } from 'lucide-react';
import { mediaSrc } from '@/lib/api-client';

export default function PeopleRow({ people, enabledNames, favoriteNames, activePerson, displayName, onRename, onOpen, onLocked }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-black text-white">People in Your Memories</h2><p className="mt-1 text-sm text-white/45">Tap a face to see matching memories. Tap a name to edit it.</p></div></div>
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
        {people.map((person) => {
          const enabled = enabledNames.includes(person.name);
          const favorite = favoriteNames.includes(person.name);
          const selected = activePerson === person.name;
          const label = displayName ? displayName(person.name) : person.name;
          return (
            <div key={person.name} className="w-20 shrink-0 text-center">
              <button onClick={() => enabled ? onOpen(person.name) : onLocked(person)} className="block w-full">
                <span className={`relative mx-auto block h-16 w-16 overflow-hidden rounded-full border-2 bg-white/5 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : enabled ? 'border-white/25' : 'border-white/10 opacity-55'}`}>
                  {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className="h-full w-full object-cover scale-[2.65] origin-top" style={{ objectPosition: '50% 18%' }} /> : <span className="grid h-full w-full place-items-center font-black text-white/60">{label.slice(0,1).toUpperCase()}</span>}
                  {favorite && <span className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-full bg-pink-500 text-white"><Heart className="h-3.5 w-3.5 fill-current" /></span>}
                </span>
              </button>
              <button onClick={() => onRename && onRename(person.name)} className="mt-2 inline-flex max-w-full items-center justify-center gap-1 text-xs font-bold text-white/75"><span className="truncate">{label}</span><Pencil className="h-3 w-3 text-white/35" /></button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
