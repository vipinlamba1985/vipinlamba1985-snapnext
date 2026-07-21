'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, Cloud, Download, HardDrive, Loader2, Pause, Play, RotateCcw, ShieldCheck, Smartphone, Square } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const RULES = [
  { type: 'favorite_people', label: 'Favourite people first', nativeOnly: true },
  { type: 'favorites', label: 'Favourites first' },
  { type: 'recent', label: 'Recent memories first' },
  { type: 'photos_first', label: 'Photos before videos' },
  { type: 'everything', label: 'Everything else' },
];

const IOS_APP_URL = process.env.NEXT_PUBLIC_IOS_APP_URL || '';
const ANDROID_APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || '';

function bytes(value) {
  if (!value) return '0 GB';
  return `${(value / 1024 / 1024 / 1024).toFixed(value > 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

function appLink(url, label) {
  if (!url) return <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/35">{label} coming soon</span>;
  return <a href={url} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black"><Download className="h-3.5 w-3.5" /> {label}</a>;
}

export default function SmartSyncPage() {
  const [profile, setProfile] = useState(null);
  const [providers, setProviders] = useState([]);
  const [storage, setStorage] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState('');
  const runnerBusy = useRef(false);

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

  const selectedProvider = useMemo(() => providers.find(provider => provider.id === profile?.providerId), [providers, profile]);
  const activeJob = useMemo(() => jobs.find(job => ['queued', 'running', 'paused'].includes(job.status)), [jobs]);
  const latestJob = jobs[0] || null;
  const nativeSelected = selectedProvider?.surface === 'native';

  async function runBatch(job) {
    if (!job || runnerBusy.current || !['queued', 'running'].includes(job.status) || job.providerId !== 'google_drive') return;
    runnerBusy.current = true;
    try {
      await apiFetch(`/smart-sync/jobs/${job.id}/run`, { method: 'POST', body: '{}' });
      await load();
    } catch (error) {
      toast.error(error.message || 'Smart Sync could not continue.');
    } finally {
      runnerBusy.current = false;
    }
  }

  useEffect(() => {
    if (!activeJob || activeJob.providerId !== 'google_drive' || !['queued', 'running'].includes(activeJob.status)) return undefined;
    const timer = setInterval(() => runBatch(activeJob), 5000);
    runBatch(activeJob);
    return () => clearInterval(timer);
  }, [activeJob?.id, activeJob?.status]);

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

  async function savePlan({ enable = false, approve = false } = {}) {
    setBusy(enable ? 'start' : 'save');
    try {
      const next = { ...profile, enabled: enable ? true : profile.enabled };
      const data = await apiFetch('/smart-sync', { method: 'POST', body: JSON.stringify({ profile: next, approved: approve }) });
      setProfile(data.profile);
      if (enable) {
        const created = await apiFetch('/smart-sync/jobs', { method: 'POST', body: JSON.stringify({ mode: 'automatic' }) });
        await load();
        toast.success(created.existing ? 'Smart Sync is continuing your saved job.' : 'Smart Sync started.');
      } else {
        toast.success(approve ? 'Smart Sync plan approved.' : 'Smart Sync plan saved.');
      }
    } catch (error) {
      toast.error(error.message || 'We could not save your Smart Sync plan.');
    } finally {
      setBusy('');
    }
  }

  async function stopSmartSync() {
    setBusy('stop');
    try {
      if (activeJob) await apiFetch(`/smart-sync/jobs/${activeJob.id}/stop`, { method: 'POST', body: '{}' });
      const next = { ...profile, enabled: false };
      const data = await apiFetch('/smart-sync', { method: 'POST', body: JSON.stringify({ profile: next }) });
      setProfile(data.profile);
      await load();
      toast.success('Smart Sync stopped. Completed memories remain safe.');
    } catch (error) {
      toast.error(error.message || 'Smart Sync could not be stopped.');
    } finally {
      setBusy('');
    }
  }

  async function jobAction(job, action) {
    setBusy(`${job.id}:${action}`);
    try {
      await apiFetch(`/smart-sync/jobs/${job.id}/${action}`, { method: 'POST', body: '{}' });
      await load();
      toast.success(action === 'stop' ? 'Sync job stopped.' : `Sync job ${action}d.`);
    } catch (error) {
      toast.error(error.message || 'Could not update the sync job.');
    } finally {
      setBusy('');
    }
  }

  if (!profile) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/50" /></div>;

  return <div className="space-y-6 pb-16">
    <header>
      <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-200"><Cloud className="h-3.5 w-3.5" /> Smart Sync</div>
      <h1 className="mt-3 text-3xl font-black">Keep your memories safely in sync</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">The web app manages cloud sources and progress. For automatic phone-library backup and the best large-upload performance, use the SnapNext mobile app.</p>
    </header>

    <section className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/15 to-cyan-500/10 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex max-w-2xl items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-black"><Smartphone className="h-6 w-6" /></div><div><h2 className="font-black">Best performance on iPhone and Android</h2><p className="mt-1 text-sm leading-6 text-white/55">The native app can continue approved uploads in the background, use your selected or full photo-library permission, and resume after interruptions.</p></div></div>
        <div className="flex flex-wrap gap-2">{appLink(IOS_APP_URL, 'iPhone app')}{appLink(ANDROID_APP_URL, 'Android app')}</div>
      </div>
    </section>

    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-2">
        <h2 className="text-lg font-black">Choose a source</h2>
        <p className="mt-1 text-sm text-white/50">Google Drive is the first durable cloud worker. Google Photos uses user-selected Picker access; other adapters remain visible until configured.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{providers.map(provider => {
          const disabled = !provider.available && provider.surface !== 'native';
          const status = provider.connected ? 'Connected' : provider.surface === 'native' ? 'Use mobile app' : provider.availability === 'picker_ready' ? 'Picker ready' : provider.available ? 'Connect' : 'Setup later';
          return <button key={provider.id} disabled={disabled} onClick={() => setProfile(current => ({ ...current, providerId: provider.id, enabled: false }))} className={`rounded-2xl border p-4 text-left disabled:opacity-45 ${profile.providerId === provider.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-black/10'}`}><div className="flex items-center justify-between gap-3"><span className="font-black">{provider.name}</span><span className="text-[11px] text-white/45">{status}</span></div><p className="mt-1 text-xs text-white/45">{provider.surface === 'native' ? 'Automatic device backup in the native app' : provider.syncStrategy === 'user_selected_picker' ? 'You choose items through the provider picker' : 'Read-only cloud copy'}</p></button>;
        })}</div>
        {!selectedProvider?.connected && profile.providerId === 'google_drive' && selectedProvider?.available && <Link href="/imports" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black"><Cloud className="h-4 w-4" /> Connect Google Drive</Link>}
        {nativeSelected && <p className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-white/55">Open the SnapNext mobile app, choose manual access or automatic backup, and approve the system photo permission there. Your web settings will appear automatically.</p>}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><HardDrive className="h-6 w-6 text-purple-300" /><h2 className="mt-3 font-black">Storage safety</h2><p className="mt-2 text-2xl font-black">{bytes(storage?.usedBytes)}</p><p className="text-xs text-white/45">currently used · {storage?.itemCount || 0} memories</p><div className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/50"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> Duplicates are skipped, originals are untouched, and syncing stops at your plan capacity.</div></div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="text-lg font-black">Priority</h2>
      <p className="mt-1 text-sm text-white/50">Keep this simple: enable what matters, move it up or down, save, then approve and start.</p>
      <div className="mt-5 space-y-2">{profile.rules.map((rule, index) => {
        const info = RULES.find(item => item.type === rule.type) || { label: rule.label };
        const unsupported = info.nativeOnly && selectedProvider?.surface !== 'native';
        return <div key={rule.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${rule.enabled ? 'border-white/10 bg-black/15' : 'border-white/5 bg-black/5 opacity-55'}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-black">{index + 1}</span><button disabled={unsupported} onClick={() => toggleRule(rule.type)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border disabled:opacity-25 ${rule.enabled ? 'border-emerald-400 bg-emerald-500' : 'border-white/20'}`}>{rule.enabled && <Check className="h-4 w-4" />}</button><div className="min-w-0 flex-1"><div className="font-black">{info.label}</div>{unsupported && <div className="mt-0.5 text-xs text-white/35">Available with confirmed People in the native app</div>}</div><div className="flex gap-1"><button onClick={() => move(index, -1)} disabled={index === 0} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button onClick={() => move(index, 1)} disabled={index === profile.rules.length - 1} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button></div></div>;
      })}</div>
      <div className="mt-5 flex flex-wrap gap-2"><button disabled={Boolean(busy)} onClick={() => savePlan()} className="rounded-full border border-white/10 px-5 py-3 text-sm font-black disabled:opacity-40">Save plan</button>{profile.enabled ? <button disabled={Boolean(busy)} onClick={stopSmartSync} className="inline-flex items-center gap-2 rounded-full bg-rose-400 px-5 py-3 text-sm font-black text-black disabled:opacity-40"><Square className="h-4 w-4" /> Stop Smart Sync</button> : <button disabled={Boolean(busy) || !selectedProvider?.connected || nativeSelected} onClick={() => savePlan({ enable: true, approve: true })} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black disabled:opacity-40">{busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Approve and start</button>}</div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="text-lg font-black">Sync progress</h2>
      <p className="mt-1 text-sm text-white/50">The job remains saved after refresh. The web app advances Google Drive while open, and the protected cron continues it later.</p>
      {latestJob ? <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-black">{providers.find(item => item.id === latestJob.providerId)?.name || latestJob.providerId}</div><div className="mt-1 text-xs text-white/45">{latestJob.status} · {latestJob.progress.processed} processed · {latestJob.importedItems || 0} imported · {latestJob.skippedItems || 0} skipped · {latestJob.failedItems || 0} failed</div>{latestJob.completionReason && <div className="mt-1 text-xs text-amber-100/70">{latestJob.completionReason.replaceAll('_', ' ')}</div>}{latestJob.lastError && <div className="mt-1 text-xs text-rose-200">{latestJob.lastError}</div>}</div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{latestJob.progress.percent}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${latestJob.progress.percent}%` }} /></div><div className="mt-4 flex flex-wrap gap-2">{['queued', 'running'].includes(latestJob.status) && <button onClick={() => jobAction(latestJob, 'pause')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Pause className="h-3.5 w-3.5" /> Pause</button>}{latestJob.status === 'paused' && <button onClick={() => jobAction(latestJob, 'resume')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Play className="h-3.5 w-3.5" /> Resume</button>}{latestJob.status === 'failed' && <button onClick={() => jobAction(latestJob, 'retry')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}{!['completed', 'stopped'].includes(latestJob.status) && <button onClick={() => jobAction(latestJob, 'stop')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 px-3 py-2 text-xs font-black text-rose-200 disabled:opacity-40"><Square className="h-3.5 w-3.5" /> Stop</button>}</div></div> : <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/45">No sync job yet.</div>}
    </section>
  </div>;
}
