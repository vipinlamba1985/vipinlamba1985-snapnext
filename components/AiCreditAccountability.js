'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Clock3, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

function formatReset(value) {
  if (!value) return 'next week';
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return 'next week';
  }
}

export default function AiCreditAccountability() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/ai/credits').then(setData).catch(() => setData(null));
  }, []);

  const percent = useMemo(() => {
    if (!data?.weeklyCredits) return 0;
    return Math.min(100, Math.round((data.usedCredits / data.weeklyCredits) * 100));
  }, [data]);

  if (!data) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-cyan-500/10 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-pink-200"><Sparkles className="h-4 w-4" /> AI Credits</div>
          <h2 className="mt-2 text-2xl font-bold">{data.remainingCredits} of {data.weeklyCredits} remaining</h2>
          <p className="mt-1 text-sm text-white/55">Credits measure included AI capacity. They are not an extra charge.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <div className="text-xs text-white/45">Resets automatically</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold"><Clock3 className="h-4 w-4 text-cyan-300" /> {formatReset(data.resetsAt)}</div>
        </div>
      </div>

      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: `${percent}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs text-white/45"><span>{data.usedCredits} used{data.reservedCredits ? ` · ${data.reservedCredits} processing` : ''}</span><span>{data.weeklyCredits} weekly</span></div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data.planComparison || []).map((plan) => (
          <div key={plan.id} className={`rounded-2xl border p-4 ${data.plan === plan.id ? 'border-pink-400/50 bg-pink-400/10' : 'border-white/10 bg-white/[0.035]'}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{plan.name}</span>{data.plan === plan.id && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">Your plan</span>}</div>
            <div className="mt-2 text-2xl font-black">{plan.weeklyCredits}</div>
            <div className="text-xs text-white/45">AI Credits each week</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs leading-5 text-white/60"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><span>Cached AI results use 0 credits. When credits run out, uploads, gallery, memories, local organization and downloads continue normally; only optional paid AI pauses until reset or upgrade.</span></div>
    </section>
  );
}
