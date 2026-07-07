'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, ScanFace, ShieldCheck } from 'lucide-react';
import { discoverLocalPeople } from '@/lib/local-face-discovery';

export default function IdentityDiscovery({ flow }) {
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    if (flow.people.supported !== null || flow.people.scanning) return;
    let cancelled = false;
    flow.setPeople((current) => ({ ...current, scanning: true, total: Math.min(flow.report.photos, 240) }));
    discoverLocalPeople(flow.items, (scanned, total, clusterCount) => {
      if (!cancelled) flow.setPeople((current) => ({ ...current, scanning: true, scanned, total, liveClusterCount: clusterCount }));
    }).then((result) => { if (!cancelled) flow.applyPeopleDiscovery(result); });
    return () => { cancelled = true; };
  }, []);

  if (flow.people.scanning) {
    const percent = flow.people.total ? Math.round((flow.people.scanned / flow.people.total) * 100) : 0;
    return (
      <section className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 text-center md:p-10">
        <Loader2 className="mx-auto h-9 w-9 animate-spin text-pink-300" />
        <h1 className="mt-5 text-3xl font-black text-white">Finding people in your memories…</h1>
        <p className="mt-3 text-sm text-white/50">This scan stays in your browser. Face crops and similarity descriptors are not uploaded.</p>
        <div className="mx-auto mt-6 h-2 max-w-xl overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-cyan-400 to-pink-500 transition-all" style={{ width: `${percent}%` }} /></div>
        <p className="mt-2 text-xs text-white/40">{flow.people.scanned} of {flow.people.total} sampled photos · {flow.people.liveClusterCount || 0} possible people groups</p>
      </section>
    );
  }

  if (!flow.people.supported || !flow.people.clusters.length) {
    return (
      <section className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-10">
        <ScanFace className="h-8 w-8 text-pink-200" />
        <h1 className="mt-4 text-3xl font-black text-white">People discovery is not available in this browser yet</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">You can still build a real protection plan now. SnapNext will use confirmed person labels already available after protection and the AI Index can deepen organization later.</p>
        <button onClick={() => flow.setStage('priority')} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-black">Continue <ArrowRight className="h-4 w-4" /></button>
      </section>
    );
  }

  const candidate = flow.people.clusters[Math.min(candidateIndex, flow.people.clusters.length - 1)];
  if (!flow.priority.selfClusterId && candidate) {
    return (
      <section className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-gradient-to-br from-pink-500/10 via-white/[0.03] to-cyan-400/10 p-6 text-center md:p-10">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-200/70">Identity confirmation</p>
        <h1 className="mt-3 text-4xl font-black text-white">Is this you?</h1>
        <img src={candidate.preview} alt="Possible profile" className="mx-auto mt-7 h-44 w-44 rounded-full border-4 border-white/15 object-cover shadow-2xl" />
        <p className="mt-4 text-sm text-white/50">Found in about {candidate.count} sampled appearances. You are always separated from other people rankings after confirmation.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button onClick={() => { flow.setPriority((current) => ({ ...current, selfClusterId: candidate.id })); }} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-3 text-sm font-black text-white">Yes, this is me</button>
          <button onClick={() => setCandidateIndex((index) => Math.min(index + 1, flow.people.clusters.length - 1))} disabled={candidateIndex >= flow.people.clusters.length - 1} className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/65 disabled:opacity-35">Not me</button>
          <button onClick={() => flow.setStage('priority')} className="rounded-full px-5 py-3 text-sm text-white/40">I’m not shown here</button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl rounded-[2rem] border border-emerald-400/20 bg-emerald-400/[0.06] p-6 md:p-10">
      <div className="flex items-start gap-4"><ShieldCheck className="mt-1 h-8 w-8 text-emerald-200" /><div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-100/60">You confirmed</p><h1 className="mt-2 text-3xl font-black text-white">Now SnapNext can separate “Me” from other people</h1><p className="mt-3 text-sm leading-6 text-white/50">We found {flow.people.clusters.length} possible people groups in the sampled photos. Next you can choose who or what matters most.</p></div></div>
      <button onClick={() => flow.setStage('priority')} className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-black">Choose My Memory Priority <ArrowRight className="h-4 w-4" /></button>
    </section>
  );
}
