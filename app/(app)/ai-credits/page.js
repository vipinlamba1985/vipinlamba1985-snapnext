'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Sparkles, RefreshCw, ShieldCheck } from 'lucide-react';

export default function AiCreditsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setData(await apiFetch('/ai/credits')); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  if (loading) return <div className="text-white/50">Loading AI Credits…</div>;
  if (!data) return <div className="text-white/50">AI Credits are unavailable right now.</div>;
  const usedPct = data.weeklyCredits ? Math.min(100, Math.round((data.usedCredits / data.weeklyCredits) * 100)) : 0;
  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-fuchsia-300"/> AI Credits</h1><p className="mt-1 text-white/55">See exactly what your plan includes and how much AI capacity remains.</p></div><button onClick={load} className="rounded-full border border-white/10 bg-white/5 p-2"><RefreshCw className="h-4 w-4"/></button></div>
    <section className="rounded-3xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/10 to-purple-600/5 p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap"><div><div className="text-sm text-white/55">This week</div><div className="mt-1 text-4xl font-black">{data.remainingCredits} <span className="text-lg font-medium text-white/45">of {data.weeklyCredits} left</span></div></div><div className="text-right text-sm text-white/55">Resets automatically<br/><span className="text-white">{new Date(data.resetsAt).toLocaleString()}</span></div></div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500" style={{ width: usedPct + '%' }}/></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-white/5 p-3"><div className="text-lg font-bold">{data.usedCredits}</div><div className="text-white/45">used</div></div><div className="rounded-xl bg-white/5 p-3"><div className="text-lg font-bold">{data.reservedCredits}</div><div className="text-white/45">processing</div></div><div className="rounded-xl bg-white/5 p-3"><div className="text-lg font-bold">{data.remainingCredits}</div><div className="text-white/45">available</div></div></div>
    </section>
    <section><h2 className="text-xl font-bold">Free vs paid plans</h2><div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">{data.planComparison?.map(p => <div key={p.id} className={`rounded-2xl border p-4 ${p.id === data.plan ? 'border-fuchsia-400/50 bg-fuchsia-500/10' : 'border-white/10 bg-white/[0.03]'}`}><div className="font-semibold">{p.name}</div><div className="mt-2 text-3xl font-black">{p.weeklyCredits}</div><div className="text-xs text-white/45">AI Credits/week</div><div className="mt-1 text-xs text-white/35">about {p.estimatedMonthlyCredits}/month</div>{p.id === data.plan && <div className="mt-3 text-[11px] font-bold text-fuchsia-200">YOUR PLAN</div>}</div>)}</div></section>
    <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 flex gap-3"><ShieldCheck className="h-5 w-5 text-emerald-300 shrink-0"/><div><div className="font-semibold">No surprise charges</div><p className="mt-1 text-sm text-white/55">AI Credits are included capacity, not a separate bill. Cached AI results use 0 credits. When credits finish, uploads, gallery, duplicate detection and basic organization continue normally.</p></div></section>
    <Link href="/billing" className="inline-flex rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-semibold">Compare storage and plan pricing</Link>
  </div>;
}
