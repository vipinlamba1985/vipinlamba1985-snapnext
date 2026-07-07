'use client';

import { useEffect, useRef } from 'react';
import { Images, LockKeyhole, Sparkles, ArrowRight, Image as ImageIcon, Film, MonitorSmartphone, FileText, User, Heart, Users, Stars, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { classifyLocalFile } from '@/lib/discovery-classify';
import useDiscoveryFlow from '@/components/protection/useDiscoveryFlow';
import IdentityDiscovery from './IdentityDiscovery';
import PeoplePriorityPicker from './PeoplePriorityPicker';
import ProtectionStages from './ProtectionStages';
import PriorityTruthNote from './PriorityTruthNote';

const PRIORITIES = [
  { id: 'self', title: 'Just Me', copy: 'Protect your best portraits, milestones and life stages first.', icon: User },
  { id: 'person', title: 'Someone I Care About', copy: 'Prioritize the confirmed person group you choose.', icon: Heart },
  { id: 'together', title: 'Us Together', copy: 'Prioritize memories where your confirmed self group and chosen person appear together.', icon: Users },
  { id: 'best_of_life', title: 'Best of My Life', copy: 'Build a balanced protection plan across your strongest memories.', icon: Stars },
];

export default function DiscoveryFlow() {
  const inputRef = useRef(null);
  const flow = useDiscoveryFlow();
  useEffect(() => { apiFetch('/storage/usage').then(flow.setUsage).catch(() => {}); }, []);
  useEffect(() => {
    if (flow.stage !== 'protecting') return;
    const warn = (event) => { event.preventDefault(); event.returnValue = 'Your memories are still being protected.'; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flow.stage]);

  function chooseFiles(files) {
    const items = files.filter((file) => file.type?.startsWith('image/') || file.type?.startsWith('video/')).map(classifyLocalFile);
    if (!items.length) return;
    flow.setItems(items);
    flow.setStage('report');
  }

  async function startProtection() {
    try {
      flow.setStage('protecting');
      const decisions = await flow.prepareProtection();
      const { runProtectionQueue } = await import('@/lib/protection-run');
      const counts = await runProtectionQueue(flow.plan.selected, decisions, flow.updateQueue);
      flow.setSummary(counts);
      flow.setProtecting(false);
      flow.setStage('results');
    } catch {
      flow.setProtecting(false);
      flow.setStage('review');
    }
  }

  if (flow.stage === 'protecting' || flow.stage === 'results') return <ProtectionStages flow={flow} />;
  if (flow.stage === 'identity') return <div className="pb-36 md:pb-12"><IdentityDiscovery flow={flow} /></div>;

  if (flow.stage === 'welcome') return (
    <div className="mx-auto max-w-5xl pb-36 md:pb-12"><section className="rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-600/10 to-cyan-500/10 p-6 text-center md:p-12">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/10 text-pink-200"><Sparkles className="h-8 w-8" /></div>
      <h1 className="mt-6 text-4xl font-black tracking-tight text-white md:text-6xl">See the magic in your memories ✨</h1>
      <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/60">SnapNext can discover the photos, videos, screenshots and moments already in the library you choose.</p>
      <button onClick={() => inputRef.current?.click()} className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white"><Images className="h-5 w-5" /> See What SnapNext Finds</button>
      <input ref={inputRef} type="file" multiple accept="image/*,video/*" onChange={(event) => { chooseFiles(Array.from(event.target.files || [])); event.target.value = ''; }} className="hidden" />
      <p className="mt-4 text-sm text-white/45">For the most complete discovery, choose all your photos and videos when your library opens.</p>
      <div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"><LockKeyhole className="h-4 w-4 shrink-0" /> Nothing is uploaded until you review and approve what to protect.</div>
    </section></div>
  );

  if (flow.stage === 'report') {
    const stats = [
      { label: 'Photos', value: flow.report.photos, icon: ImageIcon }, { label: 'Videos', value: flow.report.videos, icon: Film },
      { label: 'Screenshots', value: flow.report.screenshots, icon: MonitorSmartphone }, { label: 'Possible documents', value: flow.report.documents, icon: FileText },
    ];
    return <div className="mx-auto max-w-5xl space-y-6 pb-36 md:pb-12"><section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-200/70">Discovery complete</p><h1 className="mt-2 text-3xl font-black text-white md:text-5xl">Look what SnapNext found ✨</h1>
      <p className="mt-3 text-sm text-white/50">Selected {flow.report.total} items · {formatBytes(flow.report.bytes)}. Discovery is not backup.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-white/10 bg-black/20 p-4"><stat.icon className="h-5 w-5 text-pink-200" /><div className="mt-3 text-2xl font-black text-white">{stat.value}</div><div className="mt-1 text-xs text-white/45">{stat.label}</div></div>)}</div>
      <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => flow.setStage('identity')} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-black">Find People & Choose What to Protect <ArrowRight className="h-4 w-4" /></button><button onClick={() => flow.setStage('welcome')} className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/65">Start Again</button></div>
    </section></div>;
  }

  if (flow.stage === 'priority') {
    const needsPerson = flow.priority.type === 'person' || flow.priority.type === 'together';
    const hasDetectedChoices = flow.people.clusters.some((cluster) => cluster.id !== flow.priority.selfClusterId);
    const personReady = !needsPerson || (flow.priority.personName.trim() && (!hasDetectedChoices || flow.priority.personClusterId));
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-36 md:pb-12"><section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-200/70">Memory Priority</p><h1 className="mt-2 text-3xl font-black text-white md:text-5xl">What would you like to protect first?</h1>
        <div className="mt-7 grid gap-3 md:grid-cols-2">{PRIORITIES.map((option) => { const selected = flow.priority.type === option.id; return <button key={option.id} onClick={() => flow.setPriority((current) => ({ ...current, type: option.id }))} className={`rounded-3xl border p-5 text-left ${selected ? 'border-pink-400/60 bg-pink-500/10' : 'border-white/10 bg-black/15'}`}><option.icon className="h-6 w-6 text-pink-200" /><div className="mt-3 text-lg font-black text-white">{option.title}</div><p className="mt-1 text-sm leading-6 text-white/50">{option.copy}</p></button>; })}</div>
        {needsPerson && <><PeoplePriorityPicker flow={flow} /><PriorityTruthNote /></>}
        <div className="mt-7 flex flex-wrap gap-3"><button onClick={() => flow.setStage('review')} disabled={!personReady} className="rounded-full bg-white px-6 py-3 text-sm font-black text-black disabled:opacity-40">Build My Protection Plan</button><button onClick={() => flow.setStage('identity')} className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/65">Back</button></div>
      </section></div>
    );
  }

  if (flow.stage === 'review') return (
    <div className="mx-auto max-w-4xl space-y-6 pb-36 md:pb-12"><section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-400/10 via-white/[0.03] to-purple-500/10 p-6 md:p-8">
      <div className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-emerald-200" /><div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-100/60">Approval required</p><h1 className="mt-1 text-3xl font-black text-white">Ready to protect your memories?</h1></div></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-white/40">Will protect</div><div className="mt-2 text-2xl font-black text-white">{flow.plan.selected.length} memories</div><div className="mt-1 text-sm text-white/50">{formatBytes(flow.plan.usedBytes)}</div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-white/40">Outside this plan</div><div className="mt-2 text-2xl font-black text-white">{flow.plan.outside.length} memories</div><div className="mt-1 text-sm text-white/50">Nothing outside this plan will upload.</div></div></div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-white/55">Priority: <b className="text-white">{PRIORITIES.find((item) => item.id === flow.priority.type)?.title}</b>{flow.priority.personName ? ` · ${flow.priority.personName}` : ''}<br />Your protected space currently has {formatBytes(flow.availableBytes)} available.</div>
      <div className="mt-7 flex flex-wrap gap-3"><button onClick={startProtection} disabled={!flow.plan.selected.length} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-3 text-sm font-black text-white disabled:opacity-40">Protect These Memories</button><button onClick={() => flow.setStage('priority')} className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/65">Adjust My Plan</button><button onClick={() => flow.setStage('welcome')} className="rounded-full px-4 py-3 text-sm text-white/40">Cancel</button></div>
    </section></div>
  );

  return <div />;
}
