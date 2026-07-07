'use client';

import { useEffect, useRef } from 'react';
import { Images, LockKeyhole, Sparkles, ArrowRight, Image as ImageIcon, Film, MonitorSmartphone, FileText } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { classifyLocalFile } from '@/lib/discovery-classify';
import useDiscoveryFlow from '@/components/protection/useDiscoveryFlow';

export default function DiscoveryFlow() {
  const inputRef = useRef(null);
  const flow = useDiscoveryFlow();

  useEffect(() => { apiFetch('/storage/usage').then(flow.setUsage).catch(() => {}); }, []);

  function chooseFiles(files) {
    const items = files.filter((file) => file.type?.startsWith('image/') || file.type?.startsWith('video/')).map(classifyLocalFile);
    if (!items.length) return;
    flow.setItems(items);
    flow.setStage('report');
  }

  if (flow.stage === 'welcome') {
    return (
      <div className="mx-auto max-w-5xl pb-36 md:pb-12">
        <section className="rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-600/10 to-cyan-500/10 p-6 text-center md:p-12">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/10 text-pink-200"><Sparkles className="h-8 w-8" /></div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white md:text-6xl">See the magic in your memories ✨</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/60">SnapNext can discover the photos, videos, screenshots and moments already in the library you choose.</p>
          <button onClick={() => inputRef.current?.click()} className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white"><Images className="h-5 w-5" /> See What SnapNext Finds</button>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" onChange={(event) => { chooseFiles(Array.from(event.target.files || [])); event.target.value = ''; }} className="hidden" />
          <p className="mt-4 text-sm text-white/45">For the most complete discovery, choose all your photos and videos when your library opens.</p>
          <div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"><LockKeyhole className="h-4 w-4 shrink-0" /> Nothing is uploaded until you review and approve what to protect.</div>
        </section>
      </div>
    );
  }

  if (flow.stage === 'report') {
    const stats = [
      { label: 'Photos', value: flow.report.photos, icon: ImageIcon },
      { label: 'Videos', value: flow.report.videos, icon: Film },
      { label: 'Screenshots', value: flow.report.screenshots, icon: MonitorSmartphone },
      { label: 'Possible documents', value: flow.report.documents, icon: FileText },
    ];
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-36 md:pb-12">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-200/70">Discovery complete</p>
          <h1 className="mt-2 text-3xl font-black text-white md:text-5xl">Look what SnapNext found ✨</h1>
          <p className="mt-3 text-sm text-white/50">Selected {flow.report.total} items · {formatBytes(flow.report.bytes)}. Discovery is not backup.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-white/10 bg-black/20 p-4"><stat.icon className="h-5 w-5 text-pink-200" /><div className="mt-3 text-2xl font-black text-white">{stat.value}</div><div className="mt-1 text-xs text-white/45">{stat.label}</div></div>)}</div>
          <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => flow.setStage('priority')} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-black">Choose What to Protect <ArrowRight className="h-4 w-4" /></button><button onClick={() => flow.setStage('welcome')} className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/65">Start Again</button></div>
        </section>
      </div>
    );
  }

  return <div />;
}
