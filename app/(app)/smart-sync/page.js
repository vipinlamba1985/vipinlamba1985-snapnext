'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  HardDrive,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Square,
} from 'lucide-react';
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
  const amount = Number(value || 0);
  if (!amount) return '0 MB';
  if (amount < 1024 ** 3) return `${(amount / 1024 / 1024).toFixed(amount > 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${(amount / 1024 / 1024 / 1024).toFixed(amount > 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

function appLink(url, label) {
  if (!url) return <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/35">{label} coming soon</span>;
  return <a href={url} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black"><Download className="h-3.5 w-3.5" /> {label}</a>;
}

function stateLabel(asset) {
  if (asset?.sourceState === 'removed' && asset?.mediaId) return 'Source removed · SnapNext copy remains safe';
  const state = asset?.importState;
  return {
    available_to_import: 'Available to import',
    importing: 'Copying now',
    safe_in_snapnext: 'Safe in SnapNext',
    failed: 'Needs attention',
    source_removed: 'Removed from source',
    unsupported: 'Unsupported',
    capacity_blocked: 'Storage full',
  }[state] || String(state || 'Available').replaceAll('_', ' ');
}

function metric(metrics, key) {
  return Number(metrics?.[key] || 0);
}

export default function SmartSyncPage() {
  const [profile, setProfile] = useState(null);
  const [providers, setProviders] = useState([]);
  const [storage, setStorage] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [operations, setOperations] = useState(null);
  const [recentAssets, setRecentAssets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState('');
  const runnerBusy = useRef(false);

  async function load() {
    try {
      const [data, jobData] = await Promise.all([apiFetch('/smart-sync'), apiFetch('/smart-sync/jobs')]);
      setProfile(data.profile);
      setProviders(data.providers || []);
      setStorage(data.storage);
      setInventory(data.inventory || null);
      setOperations(data.operations || null);
      setRecentAssets(data.recentAssets || []);
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
        await load();
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
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">SnapNext first discovers cloud metadata, then copies and verifies approved originals. A memory is marked safe only after the original is stored or an exact duplicate is verified.</p>
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
        <p className="mt-1 text-sm text-white/50">Google Drive uses incremental change cursors. Google Photos remains a user-selected Picker import; other providers stay disabled until their adapters are configured.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{providers.map(provider => {
          const disabled = !provider.available && provider.surface !== 'native';
          const status = provider.connected ? 'Connected' : provider.surface === 'native' ? 'Use mobile app' : provider.availability === 'picker_ready' ? 'Picker ready' : provider.available ? 'Connect' : 'Setup later';
          return <button key={provider.id} disabled={disabled} onClick={() => setProfile(current => ({ ...current, providerId: provider.id, enabled: false }))} className={`rounded-2xl border p-4 text-left disabled:opacity-45 ${profile.providerId === provider.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-black/10'}`}><div className="flex items-center justify-between gap-3"><span className="font-black">{provider.name}</span><span className="text-[11px] text-white/45">{status}</span></div><p className="mt-1 text-xs text-white/45">{provider.surface === 'native' ? 'Automatic device backup in the native app' : provider.syncStrategy === 'user_selected_picker' ? 'You choose items through the provider picker' : 'Read-only cloud copy'}</p></button>;
        })}</div>
        {!selectedProvider?.connected && profile.providerId === 'google_drive' && selectedProvider?.available && <Link href="/imports" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black"><Cloud className="h-4 w-4" /> Connect Google Drive</Link>}
        {nativeSelected && <p className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-white/55">Open the SnapNext mobile app, choose manual access or automatic backup, and approve the system photo permission there. Your web settings will appear automatically.</p>}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><HardDrive className="h-6 w-6 text-purple-300" /><h2 className="mt-3 font-black">Storage safety</h2><p className="mt-2 text-2xl font-black">{bytes(storage?.usedBytes)}</p><p className="text-xs text-white/45">currently used · {storage?.itemCount || 0} memories</p><div className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/50"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> Metadata does not consume storage. Only verified originals count toward your plan.</div></div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black">Cloud inventory</h2><p className="mt-1 text-sm text-white/50">“Available” means discovered at the provider. “Safe” means copied and SHA-256 verified, or matched to an exact verified duplicate already in SnapNext.</p></div>{operations?.incrementalCursorReady && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-200">Incremental sync ready</span>}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-4"><Database className="h-5 w-5 text-amber-200" /><p className="mt-3 text-2xl font-black">{inventory?.available?.items || 0}</p><p className="text-xs text-white/45">available to import · {bytes(inventory?.available?.bytes)}</p></div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4"><CheckCircle2 className="h-5 w-5 text-emerald-200" /><p className="mt-3 text-2xl font-black">{inventory?.safe?.items || 0}</p><p className="text-xs text-white/45">safe in SnapNext · {bytes(inventory?.safe?.bytes)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><Activity className="h-5 w-5 text-cyan-200" /><p className="mt-3 text-2xl font-black">{inventory?.totals?.items || 0}</p><p className="text-xs text-white/45">provider items tracked</p></div>
      </div>
      {recentAssets.length > 0 && <div className="mt-5 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">{recentAssets.map(asset => <div key={asset.id || `${asset.provider}:${asset.providerFileId}`} className="flex items-center gap-3 bg-black/10 px-4 py-3"><div className={`h-2.5 w-2.5 shrink-0 rounded-full ${asset.importState === 'safe_in_snapnext' ? 'bg-emerald-400' : asset.importState === 'failed' || asset.importState === 'capacity_blocked' ? 'bg-rose-400' : 'bg-amber-300'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{asset.name}</p><p className="text-[11px] text-white/40">{stateLabel(asset)} · {bytes(asset.size)}</p></div>{asset.lastError && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-200" />}</div>)}</div>}
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="text-lg font-black">Priority</h2>
      <p className="mt-1 text-sm text-white/50">Enable what matters, move it up or down, save, then approve and start.</p>
      <div className="mt-5 space-y-2">{profile.rules.map((rule, index) => {
        const info = RULES.find(item => item.type === rule.type) || { label: rule.label };
        const unsupported = info.nativeOnly && selectedProvider?.surface !== 'native';
        return <div key={rule.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${rule.enabled ? 'border-white/10 bg-black/15' : 'border-white/5 bg-black/5 opacity-55'}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-black">{index + 1}</span><button disabled={unsupported} onClick={() => toggleRule(rule.type)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border disabled:opacity-25 ${rule.enabled ? 'border-emerald-400 bg-emerald-500' : 'border-white/20'}`}>{rule.enabled && <Check className="h-4 w-4" />}</button><div className="min-w-0 flex-1"><div className="font-black">{info.label}</div>{unsupported && <div className="mt-0.5 text-xs text-white/35">Available with confirmed People in the native app</div>}</div><div className="flex gap-1"><button onClick={() => move(index, -1)} disabled={index === 0} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button onClick={() => move(index, 1)} disabled={index === profile.rules.length - 1} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button></div></div>;
      })}</div>
      <div className="mt-5 flex flex-wrap gap-2"><button disabled={Boolean(busy)} onClick={() => savePlan()} className="rounded-full border border-white/10 px-5 py-3 text-sm font-black disabled:opacity-40">Save plan</button>{profile.enabled ? <button disabled={Boolean(busy)} onClick={stopSmartSync} className="inline-flex items-center gap-2 rounded-full bg-rose-400 px-5 py-3 text-sm font-black text-black disabled:opacity-40"><Square className="h-4 w-4" /> Stop Smart Sync</button> : <button disabled={Boolean(busy) || !selectedProvider?.connected || nativeSelected} onClick={() => savePlan({ enable: true, approve: true })} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black disabled:opacity-40">{busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Approve and start</button>}</div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="text-lg font-black">Sync progress</h2>
      <p className="mt-1 text-sm text-white/50">The job remains saved after refresh. Provider cursors prevent repeated full scans after initial discovery.</p>
      {latestJob ? <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-black">{providers.find(item => item.id === latestJob.providerId)?.name || latestJob.providerId}</div><div className="mt-1 text-xs text-white/45">{latestJob.status} · {latestJob.progress.processed} processed · {latestJob.importedItems || 0} imported · {latestJob.skippedItems || 0} skipped · {latestJob.failedItems || 0} failed</div>{latestJob.completionReason && <div className="mt-1 text-xs text-amber-100/70">{latestJob.completionReason.replaceAll('_', ' ')}</div>}{latestJob.lastError && <div className="mt-1 text-xs text-rose-200">{latestJob.lastError}</div>}</div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{latestJob.progress.percent}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${latestJob.progress.percent}%` }} /></div><div className="mt-4 flex flex-wrap gap-2">{['queued', 'running'].includes(latestJob.status) && <button onClick={() => jobAction(latestJob, 'pause')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Pause className="h-3.5 w-3.5" /> Pause</button>}{latestJob.status === 'paused' && <button onClick={() => jobAction(latestJob, 'resume')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Play className="h-3.5 w-3.5" /> Resume</button>}{latestJob.status === 'failed' && <button onClick={() => jobAction(latestJob, 'retry')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}{!['completed', 'stopped'].includes(latestJob.status) && <button onClick={() => jobAction(latestJob, 'stop')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 px-3 py-2 text-xs font-black text-rose-200 disabled:opacity-40"><Square className="h-3.5 w-3.5" /> Stop</button>}</div></div> : <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/45">No sync job yet.</div>}
      {(operations || latestJob?.metrics) && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl bg-black/15 p-3"><p className="text-lg font-black">{metric(operations?.totals, 'providerApiCalls')}</p><p className="text-[11px] text-white/40">provider API calls</p></div><div className="rounded-2xl bg-black/15 p-3"><p className="text-lg font-black">{bytes(metric(operations?.totals, 'bytesDownloaded'))}</p><p className="text-[11px] text-white/40">downloaded</p></div><div className="rounded-2xl bg-black/15 p-3"><p className="text-lg font-black">{metric(operations?.totals, 'providerChecksumSkips')}</p><p className="text-[11px] text-white/40">downloads avoided by provider checksum</p></div><div className="rounded-2xl bg-black/15 p-3"><p className="text-lg font-black">{metric(operations?.totals, 'contentHashSkips')}</p><p className="text-[11px] text-white/40">SHA-256 duplicates skipped</p></div></div>}
    </section>
  </div>;
}
