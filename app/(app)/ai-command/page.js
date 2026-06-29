'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Brain, ShieldCheck, Activity, BarChart3, GraduationCap, AlertTriangle, Sparkles, ShieldAlert, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';

export default function AICommandCenter() {
  const [status, setStatus] = useState(null);
  const [agents, setAgents] = useState(null);
  const [scorecards, setScorecards] = useState(null);
  const [business, setBusiness] = useState(null);
  const [certification, setCertification] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [governance, setGovernance] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [statusData, agentsData] = await Promise.all([
        apiFetch('/ai-os/status'),
        apiFetch('/ai-os/agents'),
      ]);
      setStatus(statusData);
      setAgents(agentsData);
      try { setScorecards(await apiFetch('/ai-os/scorecards')); } catch (_) {}
      try { setBusiness(await apiFetch('/ai-os/business')); } catch (_) {}
      try { setCertification(await apiFetch('/ai-os/certification')); } catch (_) {}
      try { setAlerts(await apiFetch('/ai-os/alerts')); } catch (_) {}
      try { setGovernance(await apiFetch('/ai-os/governance')); } catch (_) {}
    } catch (e) {
      setError(e.message || 'Unable to load AI OS status.');
    }
  }

  useEffect(() => { load(); }, []);

  async function updateGovernance(agentId, status) {
    try {
      await apiFetch('/ai-os/governance', {
        method: 'POST',
        body: JSON.stringify({ agentId, status, reason: `manual_${status}_from_command_center` }),
      });
      toast.success('Agent governance updated.');
      await load();
    } catch (e) {
      toast.error(e.message || 'Unable to update governance.');
    }
  }

  const agentList = agents?.agents || status?.agents || [];
  const summary = business?.summary || {};
  const alertList = alerts?.alerts || [];
  const governanceAgents = governance?.agents || [];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-white/[0.03] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/70">
              <Brain className="h-3.5 w-3.5 text-pink-300" /> SnapNext Intelligence OS
            </div>
            <h1 className="mt-4 text-3xl font-bold">AI Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">Monitor Chief AI, Guardian AI, specialist agents, feedback learning, cost signals, certification, governance, and business intelligence from one premium control room.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
            <div className="text-xs text-white/50">Version</div>
            <div className="text-lg font-semibold">{status?.version || '—'}</div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}

      <div className="grid gap-4 md:grid-cols-5">
        <Metric icon={ShieldCheck} label="Guardian" value={status ? 'Active' : '—'} />
        <Metric icon={Activity} label="Agents" value={String(agentList.length || 0)} />
        <Metric icon={BarChart3} label="30d AI Cost" value={summary.estimatedAiCost != null ? `$${summary.estimatedAiCost}` : 'Admin'} />
        <Metric icon={GraduationCap} label="Learning" value="Shadow Mode" />
        <Metric icon={ShieldAlert} label="Alerts" value={String(alertList.length)} />
      </div>

      {alertList.length > 0 && (
        <section className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">AI Alerts</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {alertList.map((alert, idx) => (
              <div key={`${alert.code}-${idx}`} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-amber-50">
                <div className="font-medium">{alert.code}</div>
                <div className="mt-1 text-amber-100/70">{alert.message}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Specialist Agents</h2>
              <p className="text-xs text-white/50">ChatGPT-like assistant behavior with SnapNext-specific specialist routing.</p>
            </div>
            <Sparkles className="h-5 w-5 text-pink-300" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {agentList.map((agent) => (
              <div key={agent.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{agent.name}</div>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">{agent.status}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-white/50">{agent.purpose || agent.role || 'SnapNext specialist agent.'}</p>
                {agent.learningMode && <div className="mt-3 text-[11px] text-pink-200/80">{agent.learningMode}</div>}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Business Intelligence</h2>
            {business ? (
              <div className="mt-4 space-y-3 text-sm">
                <Row label="Requests" value={summary.requests || 0} />
                <Row label="Credits" value={summary.credits || 0} />
                <Row label="Failure rate" value={`${Math.round((summary.failureRate || 0) * 100)}%`} />
                <Row label="Most used" value={summary.mostUsedFeature || '—'} />
                <Row label="Most expensive" value={summary.mostExpensiveFeature || '—'} />
                <div className="rounded-xl bg-white/5 p-3 text-xs text-white/60">{business.recommendation}</div>
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" /> Super User-only business metrics or no usage yet.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Certification</h2>
            <div className="mt-4 space-y-3">
              {(certification?.scorecards || scorecards?.scorecards || []).slice(0, 5).map((card) => (
                <div key={card.agentId || card.agent.id} className="rounded-2xl bg-black/20 p-3 text-xs">
                  <div className="flex items-center justify-between"><span>{card.agentName || card.agent.name}</span><span>{Math.round(((card.readinessScore ?? card.scores?.readinessScore) || 0) * 100)}%</span></div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full bg-white/60" style={{ width: `${Math.round(((card.readinessScore ?? card.scores?.readinessScore) || 0) * 100)}%` }} /></div>
                  {card.blockers?.length > 0 && <div className="mt-2 text-[11px] text-white/40">Blockers: {card.blockers.slice(0, 2).join(', ')}</div>}
                </div>
              ))}
              {!certification && !scorecards && <div className="text-xs text-white/50">Super User-only certification scorecards.</div>}
            </div>
          </div>
        </section>
      </div>

      {governanceAgents.length > 0 && (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-pink-300"/><h2 className="text-lg font-semibold">Agent Governance</h2></div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {governanceAgents.map((item) => (
              <div key={item.agentId} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs">
                <div className="font-medium">{item.agentName}</div>
                <div className="mt-1 text-white/40">Current: {item.governance?.status || item.currentStatus}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['shadow','assisted_review','restricted','disabled'].map((next) => <button key={next} onClick={()=>updateGovernance(item.agentId, next)} className="rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/15">{next}</button>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><Icon className="h-5 w-5 text-pink-300"/><div className="mt-3 text-xs text-white/50">{label}</div><div className="text-xl font-semibold">{value}</div></div>;
}

function Row({ label, value }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-white/50">{label}</span><span className="font-medium">{value}</span></div>;
}
