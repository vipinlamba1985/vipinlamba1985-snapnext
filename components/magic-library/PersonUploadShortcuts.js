'use client';

import { Plus } from 'lucide-react';
import PeopleFaceThumbnail from '@/components/magic-library/PeopleFaceThumbnail';
import { isUnknownPerson } from '@/lib/people-identity';

function labelFor(person = {}) {
  if (person.isSelf) return 'You';
  const value = String(person.displayName || '').trim();
  return !value || value === 'Add name' ? 'This person' : value;
}

export default function PersonUploadShortcuts({ people = [], enabledClusterIds = [] }) {
  const isEnabled = clusterId => Boolean(enabledClusterIds?.includes?.(clusterId));
  const choices = people.filter((person) => (
    isEnabled(person.clusterId || person.name)
    && !isUnknownPerson(person)
    && !['hidden', 'rejected', 'legacy'].includes(person.status)
  ));
  if (!choices.length) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-white">Add photos to a person</h2>
          <p className="mt-1 text-[11px] leading-5 text-white/40">You confirm the organization. It does not train face recognition.</p>
        </div>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {choices.map((person) => {
          const clusterId = person.clusterId || person.name;
          const label = labelFor(person);
          return (
            <button
              key={clusterId}
              type="button"
              onClick={() => { window.location.href = `/upload/discover?person=${encodeURIComponent(clusterId)}`; }}
              className="flex min-w-40 shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-2.5 text-left active:scale-[0.98]"
            >
              <span className="h-14 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
                <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} className="h-full w-full" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-white">{label}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-pink-200"><Plus className="h-3.5 w-3.5" /> Add photos</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
