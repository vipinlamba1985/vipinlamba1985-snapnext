'use client';

import { Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { mediaSrc } from '@/lib/api-client';

export default function PeopleActivation({ people, limit, activeNames, draftNames, onToggle, onConfirm, busy }) {
  const required = Math.min(limit, people.length);
  const firstActivation = activeNames.length === 0;
  const selectedCount = draftNames.length;
  const remaining = Math.max(0, required - selectedCount);
  const canConfirm = firstActivation
    ? selectedCount === required
    : selectedCount <= limit && selectedCount > activeNames.length;

  async function handleConfirm() {
    if (busy) return;
    if (!canConfirm) {
      if (firstActivation && remaining > 0) {
        toast.error(`Choose ${remaining} more ${remaining === 1 ? 'person' : 'people'} to activate your Magic Library.`);
      } else {
        toast.error('Choose at least one new person to activate.');
      }
      return;
    }
    await onConfirm();
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 md:p-7">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pink-500/15 text-pink-200"><Sparkles className="h-5 w-5" /></div>
        <h1 className="mt-4 text-3xl font-black text-white">{firstActivation ? `Choose ${required} people to find instantly` : 'Activate more people'}</h1>
        <p className="mt-2 text-sm text-white/55">Tap the round thumbnails you want ready for one-tap search in your Magic Library.</p>
        <p className="mt-2 text-xs text-white/35">{selectedCount} of {limit} selected</p>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {people.map((person) => {
          const selected = draftNames.includes(person.name);
          const permanent = activeNames.includes(person.name);
          return (
            <button type="button" key={person.name} onClick={() => onToggle(person.name)} className="group min-w-0 text-center" disabled={permanent || busy}>
              <span className={`relative mx-auto block aspect-square w-full max-w-24 overflow-hidden rounded-full border-2 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : 'border-white/10'}`}>
                {person.representativeMediaId ? <img src={mediaSrc(person.representativeMediaId)} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center bg-white/5 text-lg font-black text-white/60">{person.name.slice(0,1).toUpperCase()}</span>}
                {selected && <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-pink-500 text-white"><Check className="h-3.5 w-3.5" /></span>}
              </span>
              <span className="mt-2 block truncate text-xs font-bold text-white/80">{person.name}</span>
              <span className="block text-[10px] text-white/35">{person.count} memories</span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex justify-center">
        <button type="button" onClick={handleConfirm} disabled={busy} aria-busy={busy} className={`rounded-full px-6 py-3 text-sm font-black text-white ${canConfirm ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/10 text-white/55'}`}>
          {busy ? 'Activating…' : firstActivation && remaining > 0 ? `Choose ${remaining} More` : `Activate My ${selectedCount} People`}
        </button>
      </div>
    </section>
  );
}
