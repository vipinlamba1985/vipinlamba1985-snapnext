'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Unplug,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const WEB_WORKERS = new Set(['google_drive', 'google_photos', 'dropbox', 'onedrive']);

const MODES = [
  {
    id: 'index_only',
    label: 'Understand my library',
    description: 'Map what is available and prepare recommendations without copying originals.',
    icon: Search,
  },
  {
    id: 'protect_important',
    label: 'Protect important memories',
    description: 'Start with favourites and recent memories while keeping the full source indexed.',
    icon: Sparkles,
    recommended: true,
  },
  {
    id: 'protect_everything_that_fits',
    label: 'Protect everything that fits',
    description: 'Copy in priority order until your available SnapNext storage is full.',
    icon: ShieldCheck,
  },
];

const RULES = [
  { type: 'favorites', label: 'Favourites first', description: 'Uses the source’s explicit favourite or starred signal when available.' },
  { type: 'recent', label: 'Recent memories', description: 'Prioritizes memories from roughly the last two years.' },
  { type: 'photos_first', label: 'Photos before videos', description: 'Makes available storage go further.' },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bytes(value) {
  const amount = Number(value || 0);
  if (!amount) return '0 MB';
  if (amount < 1024 ** 3) return `${(amount / 1024 / 1024).toFixed(amount > 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${(amount / 1024 / 1024 / 1024).toFixed(amount > 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

function dateLabel(value) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function stateLabel(asset) {
  if (asset?.sourceState === 'removed' && asset?.mediaId) return 'Source removed · SnapNext copy remains safe';
  return {
    available_to_import: 'Understood · not protected yet',
    importing: 'Protecting now',
    safe_in_snapnext: 'Protected in SnapNext',
    failed: 'Needs attention',
    source_removed: 'Removed from source',
    unsupported: 'Unsupported',
    capacity_blocked: 'Waiting for storage',
  }[asset?.importState] || 'Understood';
}

function completionMessage(job) {
  if (!job) return '';
  if (job.completionReason === 'indexed') return `SnapNext understood ${job.indexedItems || job.processedItems || 0} source items. No originals were copied.`;
  if (job.completionReason === 'protected_important') return `Your priority memories are protected. ${job.importedItems || 0} originals were safely added.`;
  if (job.completionReason === 'no_priority_matches') return 'The source was indexed, but no new items matched your current priority plan.';
  if (job.completionReason === 'capacity_reached') return 'Your completed memories remain safe. Smart Sync paused before exceeding your storage.';
  if (job.completionReason === 'no_changes') return 'Everything is up to date. No new source changes needed protection.';
  if (job.status === 'completed') return `Smart Sync completed with ${job.importedItems || 0} protected originals.`;
  return '';
}

function statusLabel(job) {
  if (!job) return 'Ready when you are';
  if (job.status === 'queued') return 'Preparing the next safe batch';
  if (job.status === 'running') return job.syncMode === 'index_only' ? 'Understanding your source' : 'Protecting your memories';
  if (job.status === 'paused') return job.completionReason === 'capacity_reached' ? 'Paused safely · storage full' : 'Paused safely';
  if (job.status === 'failed') return 'Needs attention';
  if (job.status === 'stopped') return 'Stopped by you';
  if (job.status === 'completed') return 'Complete';
  return job.status;
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

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('oauth');
    const provider = params.get('provider');
    if (oauth === 'connected') toast.success(`${provider === 'onedrive' ? 'OneDrive' : provider === 'google_photos' ? 'Google Photos' : provider === 'dropbox' ? 'Dropbox' : 'Cloud source'} connected.`);
    if (oauth && oauth !== 'connected') toast.error('The cloud connection was not completed.');
    if (oauth) window.history.replaceState({}, '', '/smart-sync');
  }, []);

  const selectedProvider = useMemo(
    () => providers.find(provider => provider.id === profile?.providerId),
    [providers, profile?.providerId],
  );
  const activeJob = useMemo(
    () => jobs.find(job => ['queued', 'running', 'paused'].includes(job.status)),
    [jobs],
  );
  const latestJob = jobs[0] || null;
  const selectedMode = MODES.find(mode => mode.id === profile?.syncMode) || MODES[1];
  const nativeSelected = selectedProvider?.surface === 'native';
  const durableProviderReady = selectedProvider?.syncStrategy === 'durable_cloud_job' && selectedProvider?.connected;
  const pickerProviderReady = selectedProvider?.syncStrategy === 'user_selected_picker' && selectedProvider?.connected;

  async function runBatch(job) {
    if (!job || runnerBusy.current || !['queued', 'running'].includes(job.status) || !WEB_WORKERS.has(job.providerId)) return;
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
    if (!activeJob || !WEB_WORKERS.has(activeJob.providerId) || !['queued', 'running'].includes(activeJob.status)) return undefined;
    const timer = setInterval(() => runBatch(activeJob), 5000);
    runBatch(activeJob);
    return () => clearInterval(timer);
  }, [activeJob?.id, activeJob?.providerId, activeJob?.status]);

  function toggleRule(type) {
    setProfile(current => {
      const existing = current.rules.find(rule => rule.type === type);
      const rules = existing
        ? current.rules.map(rule => rule.type === type ? { ...rule, enabled: !rule.enabled } : rule)
        : [...current.rules, {
            id: type,
            type,
            label: RULES.find(rule => rule.type === type)?.label || type,
            enabled: true,
            priority: current.rules.length + 1,
            targetIds: [],
          }];
      return { ...current, rules, enabled: false };
    });
  }

  async function connectProvider(provider) {
    if (provider.id === 'google_drive') {
      window.location.assign('/imports');
      return;
    }
    setBusy(`connect:${provider.id}`);
    try {
      const data = await apiFetch(`/smart-sync/oauth/${provider.id}/start`);
      if (!data.authorizationUrl) throw new Error('The provider did not return a connection page.');
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      toast.error(error.message || `Could not connect ${provider.name}.`);
      setBusy('');
    }
  }

  async function disconnectProvider(provider) {
    setBusy(`disconnect:${provider.id}`);
    try {
      await apiFetch(`/smart-sync/oauth/${provider.id}/status`, { method: 'DELETE' });
      if (profile.providerId === provider.id) setProfile(current => ({ ...current, enabled: false }));
      await load();
      toast.success(`${provider.name} disconnected. Protected SnapNext copies remain safe.`);
    } catch (error) {
      toast.error(error.message || `Could not disconnect ${provider.name}.`);
    } finally {
      setBusy('');
    }
  }

  async function savePlan({ start = false } = {}) {
    setBusy(start ? 'start' : 'save');
    try {
      const next = { ...profile, enabled: start ? true : profile.enabled };
      const data = await apiFetch('/smart-sync', {
        method: 'POST',
        body: JSON.stringify({ profile: next, approved: start }),
      });
      setProfile(data.profile);
      if (start) {
        const created = await apiFetch('/smart-sync/jobs', {
          method: 'POST',
          body: JSON.stringify({ mode: 'automatic' }),
        });
        await load();
        toast.success(created.existing ? 'Smart Sync is continuing safely.' : 'Smart Sync started.');
      } else {
        await load();
        toast.success('Smart Sync plan saved.');
      }
    } catch (error) {
      toast.error(error.message || 'We could not save your Smart Sync plan.');
    } finally {
      setBusy('');
    }
  }

  async function startGooglePhotosPicker() {
    const popup = window.open('about:blank', 'snapnext-google-photos', 'popup,width=560,height=760');
    setBusy('google-photos-picker');
    let sessionId = '';
    try {
      const approved = await apiFetch('/smart-sync', {
        method: 'POST',
        body: JSON.stringify({ profile: { ...profile, enabled: true }, approved: true }),
      });
      setProfile(approved.profile);
      const session = await apiFetch('/smart-sync/google-photos/session', {
        method: 'POST',
        body: JSON.stringify({ maxItemCount: 500 }),
      });
      sessionId = session.sessionId;
      if (!session.pickerUri) throw new Error('Google Photos did not return a picker page.');
      if (popup) popup.location.href = session.pickerUri;
      else window.open(session.pickerUri, '_blank', 'noopener,noreferrer');
      toast.success('Choose your Google Photos. SnapNext will continue after you finish.');

      for (let attempt = 0; attempt < 100; attempt += 1) {
        await sleep(3000);
        const status = await apiFetch(`/smart-sync/google-photos/session?sessionId=${encodeURIComponent(sessionId)}`);
        if (status.ready) {
          if (popup && !popup.closed) popup.close();
          await load();
          toast.success(status.itemCount ? `${status.itemCount} selected items are ready for Smart Sync.` : 'Google Photos selection is ready.');
          return;
        }
      }
      throw new Error('Google Photos selection timed out. Start a new selection when ready.');
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      if (sessionId) {
        await apiFetch(`/smart-sync/google-photos/session?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
      }
      toast.error(error.message || 'Google Photos selection could not finish.');
    } finally {
      setBusy('');
    }
  }

  async function stopSmartSync() {
    setBusy('stop');
    try {
      if (activeJob) await apiFetch(`/smart-sync/jobs/${activeJob.id}/stop`, { method: 'POST', body: '{}' });
      const data = await apiFetch('/smart-sync', {
        method: 'POST',
        body: JSON.stringify({ profile: { ...profile, enabled: false } }),
      });
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
      toast.success(action === 'stop' ? 'Smart Sync stopped safely.' : `Smart Sync ${action}d.`);
    } catch (error) {
      toast.error(error.message || 'Could not update Smart Sync.');
    } finally {
      setBusy('');
    }
  }

  if (!profile) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/50" /></div>;

  const protectedItems = Number(latestJob?.importedItems || inventory?.safe?.items || 0);
  const understoodItems = Number(latestJob?.indexedItems || inventory?.totals?.items || 0);
  const progressPercent = latestJob?.status === 'completed' ? 100 : Number(latestJob?.progress?.percent || 0);

  return <div className="mx-auto max-w-5xl space-y-6 pb-16">
    <header>
      <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-200"><Cloud className="h-3.5 w-3.5" /> Smart Sync</div>
      <h1 className="mt-3 text-3xl font-black sm:text-4xl">Bring in what matters, without watching the machinery</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Connect where your memories live. SnapNext understands the source first, protects only what you approve, and never changes the originals.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        ['1', 'Connect', 'Choose one trusted source.'],
        ['2', 'Choose an outcome', 'Understand it, protect priorities, or protect everything that fits.'],
        ['3', 'Leave safely', 'Jobs resume from confirmed checkpoints after interruptions.'],
      ].map(([number, title, copy]) => <div key={number} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><div className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-black text-black">{number}</div><h2 className="mt-3 font-black">{title}</h2><p className="mt-1 text-xs leading-5 text-white/45">{copy}</p></div>)}
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-black">1. Where are your memories?</h2><p className="mt-1 text-sm text-white/50">Cloud sources are read-only. Device libraries are managed by the native app.</p></div>
        {selectedProvider?.connected && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-200">Connected</span>}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map(provider => {
          const disabled = !provider.available && provider.surface !== 'native';
          const selected = profile.providerId === provider.id;
          const status = provider.connected
            ? 'Connected'
            : provider.surface === 'native'
              ? 'Use mobile app'
              : provider.syncStrategy === 'user_selected_picker'
                ? provider.available ? 'Connect to choose' : 'Keys required'
                : provider.available ? 'Connect' : 'Keys required';
          return <button
            type="button"
            key={provider.id}
            disabled={disabled || Boolean(activeJob)}
            onClick={() => setProfile(current => ({ ...current, providerId: provider.id, enabled: false }))}
            className={`rounded-2xl border p-4 text-left transition disabled:opacity-40 ${selected ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-black/10 hover:border-white/20'}`}
          >
            <div className="flex items-center justify-between gap-3"><span className="font-black">{provider.name}</span><span className="text-[11px] text-white/45">{status}</span></div>
            <p className="mt-2 text-xs leading-5 text-white/40">{provider.surface === 'native' ? 'Camera-roll access with native permission' : provider.syncStrategy === 'user_selected_picker' ? 'You explicitly choose the items' : 'Incremental read-only cloud sync'}</p>
          </button>;
        })}
      </div>

      {selectedProvider && !selectedProvider.connected && selectedProvider.surface === 'web' && selectedProvider.available && (
        selectedProvider.id === 'google_drive'
          ? <Link href="/imports" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black"><Cloud className="h-4 w-4" /> Connect Google Drive</Link>
          : <button type="button" disabled={Boolean(busy)} onClick={() => connectProvider(selectedProvider)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black disabled:opacity-40">{busy === `connect:${selectedProvider.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />} Connect {selectedProvider.name}</button>
      )}
      {selectedProvider?.connected && selectedProvider.id !== 'google_drive' && <button type="button" disabled={Boolean(busy) || Boolean(activeJob)} onClick={() => disconnectProvider(selectedProvider)} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/65 disabled:opacity-40"><Unplug className="h-4 w-4" /> Disconnect {selectedProvider.name}</button>}
      {selectedProvider && !selectedProvider.available && selectedProvider.surface === 'web' && <p className="mt-4 text-xs text-amber-100/70">This source needs its OAuth client ID and secret in the production environment before it can connect.</p>}
      {nativeSelected && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-white/55"><Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><p>Open the SnapNext mobile app and approve photo access there. Web browsers cannot provide reliable background camera-roll sync.</p></div>}
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="text-lg font-black">2. What should SnapNext do?</h2>
      <p className="mt-1 text-sm text-white/50">Choose one outcome. You can change it before starting.</p>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {MODES.map(mode => {
          const Icon = mode.icon;
          const selected = profile.syncMode === mode.id;
          return <button
            type="button"
            key={mode.id}
            disabled={Boolean(activeJob)}
            onClick={() => setProfile(current => ({ ...current, syncMode: mode.id, enabled: false }))}
            className={`relative rounded-3xl border p-5 text-left transition disabled:opacity-50 ${selected ? 'border-purple-300 bg-purple-500/15' : 'border-white/10 bg-black/10 hover:border-white/20'}`}
          >
            {mode.recommended && <span className="absolute right-4 top-4 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-black">Recommended</span>}
            <Icon className="h-6 w-6 text-purple-200" />
            <h3 className="mt-4 font-black">{mode.label}</h3>
            <p className="mt-2 text-xs leading-5 text-white/45">{mode.description}</p>
            <div className={`mt-4 grid h-5 w-5 place-items-center rounded-full border ${selected ? 'border-emerald-300 bg-emerald-400 text-black' : 'border-white/20'}`}>{selected && <Check className="h-3.5 w-3.5" />}</div>
          </button>;
        })}
      </div>

      {profile.syncMode === 'protect_important' && <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
        <h3 className="font-black">What comes first</h3>
        <p className="mt-1 text-xs text-white/45">These are explainable rules, not irreversible AI decisions. Google Photos selections are always treated as explicitly important.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {RULES.map(rule => {
            const enabled = profile.rules.some(item => item.type === rule.type && item.enabled);
            return <button type="button" key={rule.type} disabled={Boolean(activeJob)} onClick={() => toggleRule(rule.type)} className={`rounded-2xl border p-4 text-left disabled:opacity-50 ${enabled ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-white/10 bg-black/10'}`}>
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-black">{rule.label}</span><span className={`grid h-5 w-5 place-items-center rounded-md border ${enabled ? 'border-emerald-300 bg-emerald-400 text-black' : 'border-white/20'}`}>{enabled && <Check className="h-3.5 w-3.5" />}</span></div>
              <p className="mt-2 text-[11px] leading-5 text-white/40">{rule.description}</p>
            </button>;
          })}
        </div>
      </div>}
    </section>

    <section className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/15 to-cyan-500/10 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <h2 className="text-lg font-black">3. Review your plan</h2>
          <p className="mt-2 text-sm leading-6 text-white/60"><strong className="text-white">{selectedProvider?.name || 'Choose a source'}</strong> · {selectedMode.label}. {profile.syncMode === 'index_only' ? 'No original files will be copied.' : 'Exact duplicates are skipped and protection stops safely at your storage limit.'}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-black/20 px-3 py-2">Originals untouched</span>
            <span className="rounded-full bg-black/20 px-3 py-2">Read-only source access</span>
            <span className="rounded-full bg-black/20 px-3 py-2">Pause or stop anytime</span>
            <span className="rounded-full bg-black/20 px-3 py-2">Verified duplicates skipped</span>
          </div>
        </div>
        <div className="min-w-[190px] rounded-2xl border border-white/10 bg-black/20 p-4"><HardDrive className="h-5 w-5 text-purple-200" /><p className="mt-3 text-xl font-black">{bytes(storage?.usedBytes)}</p><p className="mt-1 text-xs text-white/45">used by {storage?.itemCount || 0} protected memories</p></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {selectedProvider?.syncStrategy === 'durable_cloud_job' && !profile.enabled && <button type="button" disabled={Boolean(busy) || !durableProviderReady || nativeSelected} onClick={() => savePlan({ start: true })} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-35">{busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start Smart Sync</button>}
        {selectedProvider?.syncStrategy === 'user_selected_picker' && <button type="button" disabled={Boolean(busy) || !pickerProviderReady || Boolean(activeJob)} onClick={startGooglePhotosPicker} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-35">{busy === 'google-photos-picker' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Choose photos & start</button>}
        <button type="button" disabled={Boolean(busy) || Boolean(activeJob)} onClick={() => savePlan()} className="rounded-full border border-white/15 px-5 py-3 text-sm font-black disabled:opacity-35">Save for later</button>
        {profile.enabled && <button type="button" disabled={Boolean(busy)} onClick={stopSmartSync} className="inline-flex items-center gap-2 rounded-full border border-rose-300/25 px-5 py-3 text-sm font-black text-rose-100 disabled:opacity-35"><Square className="h-4 w-4" /> Turn off Smart Sync</button>}
      </div>
      {!durableProviderReady && selectedProvider?.syncStrategy === 'durable_cloud_job' && <p className="mt-3 text-xs text-amber-100/70">Connect this source before starting.</p>}
      {!pickerProviderReady && selectedProvider?.syncStrategy === 'user_selected_picker' && <p className="mt-3 text-xs text-amber-100/70">Connect Google Photos before opening the picker.</p>}
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black">Smart Sync status</h2><p className="mt-1 text-sm text-white/50">You may leave this page. Confirmed progress is stored after every small batch.</p></div>{operations?.incrementalCursorReady && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-200">Incremental updates ready</span>}</div>

      {latestJob ? <div className="mt-5 rounded-3xl border border-white/10 bg-black/15 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-black text-cyan-100">{statusLabel(latestJob)}</p><h3 className="mt-1 text-xl font-black">{providers.find(item => item.id === latestJob.providerId)?.name || latestJob.providerId}</h3><p className="mt-2 text-xs leading-5 text-white/45">{latestJob.indexedItems || 0} understood · {latestJob.importedItems || 0} protected · {latestJob.skippedItems || 0} safely skipped · {latestJob.failedItems || 0} need attention</p></div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{progressPercent}%</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${progressPercent}%` }} /></div>
        {completionMessage(latestJob) && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4 text-sm text-emerald-50"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><p>{completionMessage(latestJob)}</p></div>}
        {latestJob.lastError && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] p-4 text-sm text-rose-100"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>{latestJob.lastError}</p></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {['queued', 'running'].includes(latestJob.status) && <button type="button" onClick={() => jobAction(latestJob, 'pause')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Pause className="h-3.5 w-3.5" /> Pause</button>}
          {latestJob.status === 'paused' && <button type="button" onClick={() => jobAction(latestJob, 'resume')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Play className="h-3.5 w-3.5" /> Resume</button>}
          {latestJob.status === 'failed' && <button type="button" onClick={() => jobAction(latestJob, 'retry')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}
          {!['completed', 'stopped'].includes(latestJob.status) && <button type="button" onClick={() => jobAction(latestJob, 'stop')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 px-3 py-2 text-xs font-black text-rose-200 disabled:opacity-40"><Square className="h-3.5 w-3.5" /> Stop</button>}
        </div>
      </div> : <div className="mt-5 rounded-3xl border border-dashed border-white/10 p-8 text-center"><Activity className="mx-auto h-7 w-7 text-white/25" /><p className="mt-3 text-sm font-black">No sync has started yet</p><p className="mt-1 text-xs text-white/40">Choose a connected source and one outcome above.</p></div>}
    </section>

    <details className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <summary className="cursor-pointer text-sm font-black">Technical details</summary>
      <p className="mt-2 text-xs leading-5 text-white/40">These operational numbers are useful for support. They are not required to use Smart Sync.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-black/15 p-4"><Database className="h-5 w-5 text-amber-200" /><p className="mt-3 text-xl font-black">{understoodItems}</p><p className="text-[11px] text-white/40">source items tracked</p></div>
        <div className="rounded-2xl bg-black/15 p-4"><ShieldCheck className="h-5 w-5 text-emerald-200" /><p className="mt-3 text-xl font-black">{protectedItems}</p><p className="text-[11px] text-white/40">protected originals</p></div>
        <div className="rounded-2xl bg-black/15 p-4"><Cloud className="h-5 w-5 text-cyan-200" /><p className="mt-3 text-xl font-black">{Number(operations?.totals?.providerApiCalls || 0)}</p><p className="text-[11px] text-white/40">provider API calls</p></div>
        <div className="rounded-2xl bg-black/15 p-4"><HardDrive className="h-5 w-5 text-purple-200" /><p className="mt-3 text-xl font-black">{bytes(operations?.totals?.bytesDownloaded)}</p><p className="text-[11px] text-white/40">originals downloaded</p></div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs leading-5 text-white/45"><Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" /><p>Last provider check: {dateLabel(operations?.lastAutoSyncAt)}. Metadata inventory does not count as protected storage. Only originals successfully copied or matched to an exact verified duplicate are marked protected.</p></div>
      {recentAssets.length > 0 && <div className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">{recentAssets.slice(0, 5).map(asset => <div key={asset.id || `${asset.provider}:${asset.providerFileId}`} className="flex items-center gap-3 bg-black/10 px-4 py-3"><div className={`h-2.5 w-2.5 shrink-0 rounded-full ${asset.importState === 'safe_in_snapnext' ? 'bg-emerald-400' : asset.importState === 'failed' || asset.importState === 'capacity_blocked' ? 'bg-rose-400' : 'bg-amber-300'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{asset.name}</p><p className="text-[11px] text-white/40">{stateLabel(asset)} · {bytes(asset.size)}</p></div>{asset.lastError && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-200" />}</div>)}</div>}
    </details>
  </div>;
}
