'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Film, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function AIVideoPage() {
  const [task, setTask] = useState('Create a cinematic reel from my recent trip');
  const [qualityMode, setQualityMode] = useState('balanced');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);

  async function preview(action = 'preview') {
    setBusy(true);
    try {
      const result = await apiFetch('/ai-os/video', {
        method: 'POST',
        body: JSON.stringify({ task, qualityMode, action }),
      });
      setPlan(result);
      toast.success(action === 'submit' ? 'Video plan checked safely.' : 'Video preview ready.');
    } catch (e) {
      const safePlan = e?.error?.plan || e?.plan;
      if (safePlan) setPlan(safePlan);
      toast.error(e.message || 'Unable to preview video task.');
    } finally {
      setBusy(false);
    }
  }

  const provider = plan?.provider || plan?.error?.plan?.provider;
  const previewData = plan?.preview || plan?.error?.plan?.preview;
  const economy = previewData?.economy;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/20 via-purple-500/10 to-white/[0.03] p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/70"><Film className="h-3.5 w-3.5 text-pink-300"/> SnapNext Video Agent</div>
        <h1 className="mt-4 text-3xl font-bold">AI Video Studio</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">Plan premium reels and cinematic videos with credit preview, provider routing, and safety checks before any expensive generation starts.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div>
            <label className="text-xs text-white/60">Video request</label>
            <textarea value={task} onChange={(e)=>setTask(e.target.value)} rows={5} className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-sm outline-none focus:border-pink-400/50" />
          </div>
          <div>
            <label className="text-xs text-white/60">Quality mode</label>
            <select value={qualityMode} onChange={(e)=>setQualityMode(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none">
              {['economy','balanced','premium','ultra'].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={()=>preview('preview')} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-sm font-medium disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>} Preview cost & provider
            </button>
            <button onClick={()=>preview('submit')} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium disabled:opacity-60">
              <ShieldCheck className="h-4 w-4"/> Test safe submit
            </button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Preview</h2>
            {!plan ? <p className="mt-3 text-sm text-white/40">Your video cost, quality mode, provider, and next steps will appear here.</p> : (
              <div className="mt-4 space-y-3 text-sm">
                <Row label="Status" value={plan.status || 'preview'} />
                <Row label="Provider" value={provider?.name || 'SnapNext planning'} />
                <Row label="Credits" value={economy?.requiredCredits ?? '—'} />
                <Row label="Cost est." value={economy?.estimatedCostUsd != null ? `$${economy.estimatedCostUsd}` : '—'} />
                <div className="rounded-2xl bg-white/5 p-3 text-xs text-white/60">{plan.message || previewData?.userMessage || 'Preview ready.'}</div>
              </div>
            )}
          </div>
          {previewData?.options?.length > 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold">Quality options</h2>
              <div className="mt-3 space-y-2">
                {previewData.options.map((option) => <div key={option.label} className="rounded-2xl bg-black/20 p-3 text-xs"><div className="font-medium">{option.label} · {option.credits} credits</div><div className="mt-1 text-white/50">{option.quality}</div></div>)}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-white/50">{label}</span><span className="font-medium text-right">{value}</span></div>;
}
