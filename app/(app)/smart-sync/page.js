'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, Cloud, HardDrive, Loader2, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Square } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const RULES = [
  { type: 'favorite_people', label: 'Favourite people first', description: 'Prioritize memories matching people you have confirmed.' },
  { type: 'favorites', label: 'Favourites first', description: 'Bring starred or favourited memories before the rest.' },
  { type: 'recent', label: 'Recent memories first', description: 'Start with the newest photos and videos.' },
  { type: 'photos_first', label: 'Photos before videos', description: 'Use less storage first and complete more items sooner.' },
  { type: 'videos_first', label: 'Videos before photos', description: 'Prioritize motion memories.' },
  { type: 'everything', label: 'Everything else', description: 'Continue through the remaining library until capacity.' },
];

function bytes(value) {
  if (!value) return '0 GB';
  return `${(value / 1024 / 1024 / 1024).toFixed(value > 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

export default function SmartSyncPage() {
  const [profile, setProfile] = useState(null);
  const [providers, setProviders] = useState([]);
  const [storage, setStorage] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [jobBusy, setJobBusy] = useState('');

  async function load() {
    try {
      const [data, jobData] = await Promise.all([apiFetch('/smart-sync'), apiFetch('/smart-sync/jobs')]);
      setProfile(data.profile);
      setProviders(data.providers || []);
      setStorage(data.storage);
      setJobs(jobData.jobs || []);
    } catch (error) {
      toast.error(error.message || 'We could not open Smart Sync.');
    }
  }

  useEffect(() => { load(); }, []);

  const connectedProvider = useMemo(() => providers.find(provider => provider.id === profile?.providerId), [providers, profile]);
  const activeJob = useMemo(() => jobs.find(job => ['queued', 'running', 'paused'].includes(job.status)), [jobs]);

  function toggleRule(type) {
    setProfile(current => {
      const existing = current.rules.find(rule => rule.type === type);
      const rules = existing
        ? current.rules.map(rule => rule.type === type ? { ...rule, enabled: !rule.enabled } : rule)
        : [...current.rules, { id: type, type, label: RULES.find(rule => rule.type === type)?.label || type, enabled: true, priority: current.rules.length + 1, targetIds: [] }];
      return { ...current, rules };
    });
  }

  function move(index, direction) {
    setProfile(current => {
      const rules = [...current.rules];
      const next = index + direction;
      if (next < 0 || next >= rules.length) return current;
      [rules[index], rules[next]] = [rules[next], rules[index]];
      return { ...current, rules: rules.map((rule, position) => ({ ...rule, priority: position + 1 })) };
    });
  }

  async function save(next = profile) {
    setBusy(true);
    try {
      const data = await apiFetch('/smart-sync', { method: 'POST', body: JSON.stringify({ profile: next }) });
      setProfile(data.profile);
      toast.success(data.profile.enabled ? 'Smart Sync is active.' : 'Smart Sync is paused.');
    } catch (error) {
      toast.error(error.message || 'We could not save your Smart Sync plan.');
    } finally { setBusy(false); }
  }

  async function createJob() {
    setJobBusy('create');
    try {
      const data = await apiFetch('/smart-sync/jobs', { method: 'POST', body: JSON.stringify({}) });
      await load();
      toast.success(data.existing ? 'Your current sync job is already saved.' : 'Smart Sync job created.');
    } catch (error) { toast.error(error.message || 'Could not create the sync job.'); }
    finally { setJobBusy(''); }
  }

  async function jobAction(job, action) {
    setJobBusy(`${job.id}:${action}`);
    try {
      await apiFetch(`/smart-sync/jobs/${job.id}/${action}`, { method: 'POST', body: '{}' });
      await load();
      toast.success(action === 'stop' ? 'Sync job stopped.' : `Sync job ${action}d.`);
    } catch (error) { toast.error(error.message || 'Could not update the sync job.'); }
    finally { setJobBusy(''); }
  }

  if (!profile) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/50" /></div>;

  return <div className="space-y-6 pb-16">
    <header><div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-200"><Sparkles className="h-3.5 w-3.5" /> Smart Sync</div><h1 className="mt-3 text-3xl font-black">Your memories, in the order you choose</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Authorize a source once, review the plan before anything is copied, and change priorities at any time. Originals remain untouched.</p></header>

    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-2"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black">Sync source</h2><p className="mt-1 text-sm text-white/50">Cloud and native sources use the same saved plan and job history.</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${connectedProvider?.connected ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-100'}`}>{connectedProvider?.connected ? 'Connected' : 'Needs connection'}</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{providers.map(provider => <button key={provider.id} disabled={!provider.available} onClick={() => setProfile(current => ({ ...current, providerId: provider.id }))} className={`rounded-2xl border p-4 text-left disabled:opacity-45 ${profile.providerId === provider.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-black/10'}`}><div className="flex items-center justify-between gap-3"><span className="font-black">{provider.name}</span><span className="text-[11px] text-white/45">{provider.available ? provider.connected ? 'Ready' : 'Connect' : 'Coming next'}</span></div><p className="mt-1 text-xs text-white/45">{provider.surface === 'native' ? 'Native device source' : 'Connected cloud source'}</p></button>)}</div>{!connectedProvider?.connected && profile.providerId === 'google_drive' && <Link href="/imports" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black"><Cloud className="h-4 w-4" /> Connect Google Drive</Link>}</div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><HardDrive className="h-6 w-6 text-purple-300" /><h2 className="mt-3 font-black">Storage preflight</h2><p className="mt-2 text-2xl font-black">{bytes(storage?.usedBytes)}</p><p className="text-xs text-white/45">currently used · {storage?.itemCount || 0} memories</p><div className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/50"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> Smart Sync stops at your plan capacity and never deletes originals.</div></div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Priority queue</h2><p className="mt-1 text-sm text-white/50">Changing priority does not restart completed imports.</p></div><button disabled={busy || !connectedProvider?.connected} onClick={() => { const next = { ...profile, enabled: !profile.enabled }; setProfile(next); save(next); }} className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black disabled:opacity-40 ${profile.enabled ? 'bg-amber-400 text-black' : 'bg-emerald-400 text-black'}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : profile.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{profile.enabled ? 'Pause Smart Sync' : 'Start Smart Sync'}</button></div><div className="mt-5 space-y-2">{profile.rules.map((rule, index) => { const info = RULES.find(item => item.type === rule.type) || { label: rule.label, description: '' }; return <div key={rule.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${rule.enabled ? 'border-white/10 bg-black/15' : 'border-white/5 bg-black/5 opacity-55'}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-black">{index + 1}</span><button onClick={() => toggleRule(rule.type)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${rule.enabled ? 'border-emerald-400 bg-emerald-500' : 'border-white/20'}`}>{rule.enabled && <Check className="h-4 w-4" />}</button><div className="min-w-0 flex-1"><div className="font-black">{info.label}</div><div className="mt-0.5 text-xs text-white/45">{info.description}</div></div><div className="flex gap-1"><button onClick={() => move(index, -1)} disabled={index === 0} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button onClick={() => move(index, 1)} disabled={index === profile.rules.length - 1} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button></div></div>; })}</div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => save()} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-40">Save priority and rules</button><button disabled={jobBusy === 'create' || !profile.enabled || !connectedProvider?.connected || Boolean(activeJob)} onClick={createJob} className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-100 disabled:opacity-40">{jobBusy === 'create' ? 'Preparing…' : activeJob ? 'Sync job already active' : 'Create sync job'}</button></div></section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"><div><h2 className="text-lg font-black">Saved sync jobs</h2><p className="mt-1 text-sm text-white/50">Progress and controls remain available after refresh or reopening the app.</p></div><div className="mt-5 space-y-3">{jobs.map(job => <div key={job.id} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-black">{providers.find(item => item.id === job.providerId)?.name || job.providerId}</div><div className="mt-1 text-xs text-white/45">{job.status} · {job.progress.processed} processed · {job.importedItems || 0} imported · {job.skippedItems || 0} skipped · {job.failedItems || 0} failed</div></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{job.progress.percent}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${job.progress.percent}%` }} /></div><div className="mt-4 flex flex-wrap gap-2">{['queued', 'running'].includes(job.status) && <button onClick={() => jobAction(job, 'pause')} disabled={Boolean(jobBusy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Pause className="h-3.5 w-3.5" /> Pause</button>}{job.status === 'paused' && <button onClick={() => jobAction(job, 'resume')} disabled={Boolean(jobBusy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Play className="h-3.5 w-3.5" /> Resume</button>}{job.status === 'failed' && <button onClick={() => jobAction(job, 'retry')} disabled={Boolean(jobBusy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}{!['completed', 'stopped'].includes(job.status) && <button onClick={() => jobAction(job, 'stop')} disabled={Boolean(jobBusy)} className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 px-3 py-2 text-xs font-black text-rose-200 disabled:opacity-40"><Square className="h-3.5 w-3.5" /> Stop</button>}</div></div>)}{!jobs.length && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/45">No sync jobs yet. Save and enable a connected Smart Sync plan, then create a job.</div>}</div></section>
  </div>;
}
