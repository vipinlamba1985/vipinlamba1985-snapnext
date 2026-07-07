'use client';

import { Heart } from 'lucide-react';
import { mediaSrc } from '@/lib/api-client';

export default function PeopleRow({ people, enabledNames, favoriteNames, activePerson, onOpen, onLocked }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-black text-white">People in Your Memories</h2><p className="mt-1 text-sm text-white/45">Tap an active round thumbnail to see related photos and videos.</p></div></div>
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
        {people.map((person) => {
          const enabled = enabledNames.includes(person.name);
          const favorite = favoriteNames.includes(person.name);
          const selected = activePerson === person.name;
          return (
            <button key={person.name} onClick={() => enabled ? onOpen(person.name) : onLocked(person)} className="w-20 shrink-0 text-center">
              <span className={`relative mx-auto block h-16 w-16 overflow-hidden rounded-full border-2 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : enabled ? 'border-white/25' : 'border-white/10 opacity-55'}`}>
                {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center bg-white/5 font-black text-white/60">{person.name.slice(0,1).toUpperCase()}</span>}
                {favorite && <span className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-full bg-pink-500 text-white"><Heart className="h-3.5 w-3.5 fill-current" /></span>}
              </span>
              <span className="mt-2 block truncate text-xs font-bold text-white/75">{person.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
