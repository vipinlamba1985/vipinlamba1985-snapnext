'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Activity, Brain, Database, ShieldAlert, Users } from 'lucide-react';

function bytes(value) {
  const number = Number(value || 0);
  if (!number) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(number) / Math.log(1024)));
  return `${(number / (1024 ** index)).toFixed(index > 2 ? 2 : 1)} ${units[index]}`;
}

function money(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function Card({ label, value, detail, icon: Icon }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</p>{Icon && <Icon className="h-4 w-4 text-cyan-200" />}</div>
    <p className="mt-3 text-3xl font-black text-white">{value}</p>
    {detail && <p className="mt-2 text-xs leading-5 text-white/45">{detail}</p>}
  </div>;
}

export default function AdminOperationsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      setData(await apiFetch('/admin/operations'));
    } catch (err) {
      setError(err.message || 'Could not load operations.');
    }
  }

  useEffect(() => { load(); }, []);

  if (error) return <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm">Admin access required. {error}</div>;
  if (!data) return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">Loading launch operations…</div>;

  const guard = data.ai?.profitGuard;
  const controls = data.ai?.controls || {};
  return <div className="mx-auto max-w-7xl space-y-6 pb-24">
    <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-500/15 via-violet-500/10 to-rose-500/10 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/70">Launch operations</p><h1 className="mt-2 text-3xl font-black text-white">SnapNext operating health</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Privacy-safe service, vault, AI economics and trust metrics. No private prompts or media content are displayed.</p></div>
        <div className="flex gap-2"><button onClick={load} className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black">Refresh</button><Link href="/admin" className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-bold text-white">Admin home</Link></div>
      </div>
    </section>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card label="Registered users" value={data.users.total} detail={`${data.users.paid} paid · ${data.users.conversionPercent}% conversion`} icon={Users} />
      <Card label="Active vault media" value={data.vault.activeMedia} detail={`${bytes(data.vault.storageBytes)} stored · ${data.vault.uploadsToday} uploads today`} icon={Database} />
      <Card label="AI requests today" value={data.ai.today.requests} detail={`${data.ai.today.credits} credits · ${money(data.ai.today.estimatedCostUsd)} estimated`} icon={Brain} />
      <Card label="AI failures today" value={data.ai.today.failures} detail={`${data.ai.citationFailures} citation failures this month · ${data.ai.incorrectFeedback} incorrect ratings`} icon={ShieldAlert} />
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-200"/><h2 className="text-xl font-black text-white">AI financial guard</h2></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Card label="Monthly AI spend" value={money(data.ai.month.estimatedCostUsd)} detail={`${data.ai.month.requests} successful requests`} />
          <Card label="Remaining profit budget" value={money(guard?.remainingAiBudgetUsd)} detail={`Ceiling ${money(guard?.aiBudgetCeilingUsd)}`} />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <p className="rounded-2xl bg-black/20 p-3 text-white/60">Global AI: <strong className={controls.globalPaused ? 'text-rose-200' : 'text-emerald-200'}>{controls.globalPaused ? 'Paused' : 'Available'}</strong></p>
          <p className="rounded-2xl bg-black/20 p-3 text-white/60">OpenAI: <strong className={controls.openaiPaused ? 'text-rose-200' : 'text-emerald-200'}>{controls.openaiPaused ? 'Paused' : 'Available'}</strong> · Gemini: <strong className={controls.geminiPaused ? 'text-rose-200' : 'text-emerald-200'}>{controls.geminiPaused ? 'Paused' : 'Available'}</strong></p>
          <p className="rounded-2xl bg-black/20 p-3 text-white/60">Absolute caps: ${controls.dailyCapUsd}/day · ${controls.monthlyCapUsd}/month</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <h2 className="text-xl font-black text-white">Launch queues and trust</h2>
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-black/20 p-4"><span className="text-white/60">Private story drafts</span><strong>{data.operations.storyDrafts}</strong></div>
          <div className="flex items-center justify-between rounded-2xl bg-black/20 p-4"><span className="text-white/60">Pending Family invitations</span><strong>{data.operations.pendingFamilyInvites}</strong></div>
          <div className="flex items-center justify-between rounded-2xl bg-black/20 p-4"><span className="text-white/60">Webhook failures today</span><strong className={data.operations.webhookFailuresToday ? 'text-rose-200' : 'text-emerald-200'}>{data.operations.webhookFailuresToday}</strong></div>
          <div className="flex items-center justify-between rounded-2xl bg-black/20 p-4"><span className="text-white/60">Items in trash</span><strong>{data.vault.trashedMedia}</strong></div>
        </div>
      </section>
    </div>

    <p className="text-xs text-white/35">Generated {new Date(data.generatedAt).toLocaleString()} · {data.privacy}</p>
  </div>;
}
