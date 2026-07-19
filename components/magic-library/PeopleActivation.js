'use client';

import { Check, Sparkles } from 'lucide-react';
import PeopleFaceThumbnail from '@/components/magic-library/PeopleFaceThumbnail';
import { isUnknownPerson } from '@/lib/people-identity';

export default function PeopleActivation({ people, limit, activeNames, draftNames, onToggle, onConfirm, busy }) {
  const visiblePeople = people.filter((person) => !isUnknownPerson(person));
  const firstActivation = activeNames.length === 0;
  const ready = draftNames.length > 0 && draftNames.length <= limit;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 md:p-7">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pink-500/15 text-pink-200"><Sparkles className="h-5 w-5" /></div>
        <h1 className="mt-4 text-3xl font-black text-white">{firstActivation ? 'Choose the people who matter most' : 'Activate more people'}</h1>
        <p className="mt-2 text-sm text-white/55">SnapNext found {visiblePeople.length} usable people clusters in your memories. Your plan lets you activate up to {limit} for one-tap search and complete person views.</p>
        <p className="mt-2 text-xs text-white/35">{draftNames.length} of {limit} active people selected</p>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {visiblePeople.map((person) => {
          const selected = draftNames.includes(person.name);
          const permanent = activeNames.includes(person.name);
          const label = person.displayName && person.displayName !== 'Add name' ? person.displayName : 'Add name';
          return (
            <button key={person.name} type="button" onClick={() => onToggle(person.name)} className="group min-w-0 text-center" disabled={permanent || busy}>
              <span className={`relative mx-auto block aspect-square w-full max-w-24 overflow-hidden rounded-full border-2 ${selected ? 'border-pink-400 ring-4 ring-pink-500/20' : 'border-white/10'}`}>
                <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} manual={person.thumbnailCrop || {}} className="h-full w-full" />
                {selected && <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-pink-500 text-white"><Check className="h-3.5 w-3.5" /></span>}
              </span>
              <span className="mt-2 block truncate text-xs font-bold text-white/80">{label}</span>
              <span className="block text-[10px] text-white/35">{person.count} memories</span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex flex-col items-center justify-center gap-2">
        <button type="button" onClick={onConfirm} disabled={!ready || busy} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Activating…' : draftNames.length ? `Activate ${draftNames.length} ${draftNames.length === 1 ? 'Person' : 'People'}` : 'Select at least 1 person'}</button>
        <span className="text-[11px] text-white/35">Unknown faces do not use an active-person slot.</span>
      </div>
    </section>
  );
}
