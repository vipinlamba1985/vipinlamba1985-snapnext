'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Bot, Check, Loader2, Play, ShieldCheck, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

const EXAMPLES = [
  'Create a task to send the passport pages from my saved screenshots.',
  'Remind me about the important date in my recent document.',
  'Create a collection from my recent beach memories.',
  'Prepare a social post from my favorite recent memories.',
];

export default function AiActionsPage() {
  const [task, setTask] = useState('');
  const [actions, setActions] = useState([]);
  const [summary, setSummary] = useState('');
  const [planning, setPlanning] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const res = await apiFetch('/agent-actions?limit=30');
      setActions(res.actions || []);
    } catch (error) {
      if (!/controlled rollout|not enabled/i.test(error?.message || '')) toast.error(error?.message || 'Unable to load AI actions.');
    }
  }

  useEffect(() => { load(); }, []);

  async function plan() {
    const request = task.trim();
    if (!request) return;
    setPlanning(true);
    try {
      const res = await apiFetch('/agent-actions', { method: 'POST', body: JSON.stringify({ task: request }) });
      setSummary(res.summary || 'Plan prepared.');
      setActions((prev) => [...(res.actions || []), ...prev.filter((item) => !(res.actions || []).some((next) => next.id === item.id))]);
      if (!(res.actions || []).length) toast.info('No safe internal action was proposed.');
      else toast.success(`${res.actions.length} action${res.actions.length === 1 ? '' : 's'} ready for review.`);
      setTask('');
    } catch (error) {
      toast.error(error?.message || 'Unable to prepare an action plan.');
    } finally {
      setPlanning(false);
    }
  }

  async function decide(actionId, decision) {
    setBusyId(actionId);
    try {
      const res = await apiFetch(`/agent-actions/${actionId}`, { method: 'POST', body: JSON.stringify({ decision }) });
      setActions((prev) => prev.map((item) => item.id === actionId ? res.action : item));
      toast.success(decision === 'approve' ? 'Action completed and verified.' : 'Action cancelled.');
    } catch (error) {
      toast.error(error?.message || 'Action could not be completed.');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-white/[0.03] p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-500/20"><Bot className="h-6 w-6" /></div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100"><ShieldCheck className="h-3.5 w-3.5" /> Controlled Action Hands</div>
            <h1 className="mt-3 text-3xl font-bold">SnapNext AI Actions</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/60">Ask SnapNext to prepare an internal task, reminder, collection, or social draft. Nothing executes until you approve the exact action card.</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <textarea value={task} onChange={(event) => setTask(event.target.value)} maxLength={1800} rows={4} placeholder="Tell SnapNext what you want done..." className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white outline-none focus:border-pink-400/40" />
        <div className="mt-3 flex flex-wrap gap-2">{EXAMPLES.map((example) => <button key={example} onClick={() => setTask(example)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65 hover:bg-white/10">{example}</button>)}</div>
        <button onClick={plan} disabled={planning || !task.trim()} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-bold disabled:opacity-40">{planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Prepare safe actions</button>
        {summary && <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">{summary}</div>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Action ledger</h2><span className="text-xs text-white/40">Proposed → Approved → Executed → Verified</span></div>
        {!actions.length && <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">No actions yet.</div>}
        {actions.map((action) => <ActionCard key={action.id} action={action} busy={busyId === action.id} onDecision={decide} />)}
      </section>
    </div>
  );
}

function ActionCard({ action, busy, onDecision }) {
  const proposed = action.status === 'proposed';
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">{action.toolName?.replaceAll('_', ' ')}</span><span className="text-xs text-white/40">{action.risk || 'low'} risk</span></div>
          <div className="mt-3 text-sm font-medium text-white">{action.reason}</div>
          <pre className="mt-3 max-w-3xl overflow-x-auto whitespace-pre-wrap rounded-2xl bg-black/20 p-3 text-xs text-white/55">{JSON.stringify(action.input, null, 2)}</pre>
          {action.result && <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs text-emerald-100">Verified result: {JSON.stringify(action.result)}</div>}
        </div>
        <div className="flex items-center gap-2">
          {proposed ? <>
            <button onClick={() => onDecision(action.id, 'approve')} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Approve</button>
            <button onClick={() => onDecision(action.id, 'cancel')} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Cancel</button>
          </> : <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs ${action.status === 'completed' ? 'bg-emerald-300/10 text-emerald-200' : 'bg-white/10 text-white/60'}`}>{action.status === 'completed' && <Check className="h-3.5 w-3.5" />}{action.status}</span>}
        </div>
      </div>
    </div>
  );
}
