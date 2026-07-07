'use client';

import { useMemo, useState } from 'react';

export default function PeoplePriorityPicker({ flow }) {
  const [showMore, setShowMore] = useState(false);
  const clusters = useMemo(() => flow.people.clusters.filter((cluster) => cluster.id !== flow.priority.selfClusterId), [flow.people.clusters, flow.priority.selfClusterId]);
  const visible = showMore ? clusters : clusters.slice(0, 8);

  if (!clusters.length) {
    return (
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input value={flow.priority.personName} onChange={(event) => flow.setPriority((current) => ({ ...current, personName: event.target.value }))} placeholder="Person's name" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-pink-400/50" />
        <input value={flow.priority.relationship} onChange={(event) => flow.setPriority((current) => ({ ...current, relationship: event.target.value }))} placeholder="Relationship (optional)" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-pink-400/50" />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-pink-200/60">People most present with you</p><h2 className="mt-1 text-xl font-black text-white">Choose one person</h2></div><span className="text-xs text-white/35">Ranked by sampled appearances</span></div>
      <div className="mt-4 grid grid-cols-4 gap-3 md:grid-cols-8">
        {visible.map((cluster, index) => {
          const selected = flow.priority.personClusterId === cluster.id;
          const large = index < 2;
          return (
            <button key={cluster.id} onClick={() => flow.setPriority((current) => ({ ...current, personClusterId: cluster.id }))} className={`${large ? 'col-span-2 row-span-2' : 'col-span-1'} rounded-3xl border p-2 text-left transition ${selected ? 'border-pink-400 bg-pink-500/15' : 'border-white/10 bg-black/15 hover:border-white/25'}`}>
              <img src={cluster.preview} alt="Detected person" className={`w-full rounded-2xl object-cover ${large ? 'aspect-square' : 'aspect-square'}`} />
              <div className="mt-2 text-xs font-black text-white">{cluster.count} appearances</div>
            </button>
          );
        })}
      </div>
      {clusters.length > 8 && <button onClick={() => setShowMore((value) => !value)} className="mt-4 text-sm font-bold text-pink-200">{showMore ? 'Show Less' : `Show More (${clusters.length - 8})`}</button>}
      {!!flow.priority.personClusterId && <div className="mt-5 grid gap-3 md:grid-cols-2"><input value={flow.priority.personName} onChange={(event) => flow.setPriority((current) => ({ ...current, personName: event.target.value }))} placeholder="Name this person" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-pink-400/50" /><input value={flow.priority.relationship} onChange={(event) => flow.setPriority((current) => ({ ...current, relationship: event.target.value }))} placeholder="Partner, child, parent, friend…" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-pink-400/50" /></div>}
    </div>
  );
}
