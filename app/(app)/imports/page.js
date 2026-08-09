'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CloudDownload, FileUp, HardDrive, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck, Smartphone, Unplug } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const MAX_SELECTED_FILES = 500;
const DRIVE_BATCH_SIZE = 10;
const TERMINAL = new Set(['completed', 'failed', 'stopped', 'paused']);

function chunk(items, size) { const groups = []; for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size)); return groups; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export default function ImportsPage() {
  const [drive, setDrive] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [legacy, setLegacy] = useState({ dropbox: null, onedrive: null });
  const [driveItems, setDriveItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [driveProgress, setDriveProgress] = useState(null);
  const [photoJob, setPhotoJob] = useState(null);
  const [busy, setBusy] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function load() {
    try {
      const [driveStatus, photoStatus, dropboxStatus, onedriveStatus, jobs] = await Promise.all([
        apiFetch('/cloud/google-drive/status').catch(() => ({ connected: false, configured: false })),
        apiFetch('/smart-sync/oauth/google_photos/status').catch(() => ({ connected: false, configured: false })),
        apiFetch('/smart-sync/oauth/dropbox/status').catch(() => ({ connected: false })),
        apiFetch('/smart-sync/oauth/onedrive/status').catch(() => ({ connected: false })),
        apiFetch('/smart-sync/jobs').catch(() => ({ jobs: [] })),
      ]);
      setDrive(driveStatus);
      setPhotos(photoStatus);
      setLegacy({ dropbox: dropboxStatus, onedrive: onedriveStatus });
      const active = (jobs.jobs || []).find(job => job.providerId === 'google_photos' && ['queued', 'running', 'paused', 'failed'].includes(job.status));
      setPhotoJob(active || null);
    } catch (error) {
      toast.error(error.message || 'Smart Import could not be opened.');
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const result = query.get('oauth') || query.get('cloud');
    if (result === 'connected') toast.success('Cloud access connected for user-selected import.');
    if (result === 'cancelled') toast.message('Nothing changed.');
    if (result === 'failed' || result === 'not-configured') toast.error('The cloud connection could not be completed.');
    if (result === 'picker-required') toast.message('That provider uses Smart Import instead of background sync at launch.');
    load();
  }, []);

  async function connectDrive() {
    setBusy('connect-drive');
    try { const result = await apiFetch('/cloud/google-drive/start'); window.location.href = result.authorizationUrl; }
    catch (error) { toast.error(error.message || 'Google Drive connection could not start.'); setBusy(''); }
  }

  async function connectPhotos() {
    setBusy('connect-photos');
    try { const result = await apiFetch('/smart-sync/oauth/google_photos/start'); window.location.href = result.authorizationUrl; }
    catch (error) { toast.error(error.message || 'Google Photos connection could not start.'); setBusy(''); }
  }

  async function disconnect(provider) {
    setBusy(`disconnect:${provider}`);
    try {
      if (provider === 'google_drive') await apiFetch('/cloud/google-drive/status', { method: 'DELETE' });
      else await apiFetch(`/smart-sync/oauth/${provider}/status`, { method: 'DELETE' });
      toast.success('Connection removed. Photos already saved in SnapNext remain safe.');
      await load();
    } catch (error) { toast.error(error.message || 'Connection could not be removed.'); }
    finally { setBusy(''); }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const element = document.createElement('script'); element.src = src; element.onload = resolve; element.onerror = () => reject(new Error('Google Picker could not be loaded.')); document.body.appendChild(element);
    });
  }

  async function openGooglePicker() {
    setBusy('drive-picker');
    try {
      const auth = await apiFetch('/cloud/google-drive/picker-token');
      if (!auth.accessToken || !auth.apiKey) throw new Error('Google Picker is not configured for this deployment yet.');
      await loadScript('https://apis.google.com/js/api.js');
      await new Promise(resolve => window.gapi.load('picker', resolve));
      const picked = await new Promise(resolve => {
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS).setIncludeFolders(true).setMimeTypes('image/png,image/jpeg,image/heic,image/webp,video/mp4,video/quicktime');
        const builder = new window.google.picker.PickerBuilder().addView(view).setOAuthToken(auth.accessToken).setDeveloperKey(auth.apiKey).enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED).setCallback(data => {
          if (data.action === window.google.picker.Action.PICKED) resolve(data.docs || []);
          else if (data.action === window.google.picker.Action.CANCEL) resolve([]);
        });
        if (auth.appId) builder.setAppId(auth.appId);
        builder.build().setVisible(true);
      });
      if (!picked.length) return;
      if (picked.length > MAX_SELECTED_FILES) return toast.error(`Choose up to ${MAX_SELECTED_FILES} items at a time.`);
      const items = picked.map(doc => ({ id: doc.id, name: doc.name || 'Google Drive item', mime: doc.mimeType || '' }));
      setDriveItems(items); setSelected(items.map(item => item.id));
      toast.success(`${items.length} ${items.length === 1 ? 'item' : 'items'} chosen.`);
    } catch (error) { toast.error(error.message || 'Google Picker could not be opened.'); }
    finally { setBusy(''); }
  }

  async function importDriveSelected() {
    if (!selected.length) return toast.error('Choose at least one photo or video.');
    setBusy('drive-import');
    const totals = { saved: 0, skipped: 0, failed: 0 };
    setDriveProgress({ completed: 0, total: selected.length, ...totals });
    try {
      for (const batch of chunk(selected, DRIVE_BATCH_SIZE)) {
        const result = await apiFetch('/cloud/google-drive/import', { method: 'POST', body: JSON.stringify({ fileIds: batch }) });
        totals.saved += result.saved || 0; totals.skipped += result.skipped || 0; totals.failed += result.failed || 0;
        setDriveProgress({ completed: Math.min(selected.length, totals.saved + totals.skipped + totals.failed), total: selected.length, ...totals });
      }
      toast.success(`${totals.saved} saved${totals.skipped ? ` · ${totals.skipped} already safe` : ''}${totals.failed ? ` · ${totals.failed} need attention` : ''}`);
      setSelected([]); setDriveItems([]);
    } catch (error) { toast.error(error.message || 'Import stopped. Files already completed remain safe; choose them again to resume and SnapNext will skip duplicates.'); }
    finally { setBusy(''); }
  }

  async function runPhotoJob(initialJob) {
    if (!initialJob?.id) return;
    setBusy('photos-import');
    let job = initialJob;
    try {
      for (let attempt = 0; attempt < 80 && !TERMINAL.has(job.status); attempt += 1) {
        const response = await apiFetch(`/smart-sync/jobs/${job.id}/run`, { method: 'POST', body: '{}' });
        job = response.job || job;
        setPhotoJob(job);
        if (!TERMINAL.has(job.status)) await sleep(350);
      }
      if (job.status === 'completed') { toast.success(`${job.importedItems || 0} Google Photos items saved in SnapNext.`); setPhotoJob(null); }
      else if (job.status === 'paused') toast.message('Import paused before exceeding your SnapNext storage.');
      else if (job.status === 'failed') toast.error(job.lastError || 'Google Photos import needs retry.');
    } catch (error) { toast.error(error.message || 'Google Photos import paused. You can resume the same selection here.'); }
    finally { setBusy(''); await load(); }
  }

  async function resumePhotoJob(job) {
    if (!job?.id) return;
    try {
      let runnable = job;
      if (job.status === 'failed') {
        setBusy('photos-retry');
        const response = await apiFetch(`/smart-sync/jobs/${job.id}/retry`, { method: 'POST', body: '{}' });
        runnable = response.job || { ...job, status: 'queued' };
        setPhotoJob(runnable);
      }
      await runPhotoJob(runnable);
    } catch (error) {
      toast.error(error.message || 'This import could not be resumed yet.');
      setBusy('');
      await load();
    }
  }

  async function chooseGooglePhotos() {
    if (!photos?.connected) return connectPhotos();
    const popup = window.open('about:blank', 'snapnext-google-photos', 'popup,width=560,height=760');
    setBusy('photos-picker');
    let sessionId = '';
    try {
      const session = await apiFetch('/smart-sync/google-photos/session', { method: 'POST', body: JSON.stringify({ maxItemCount: MAX_SELECTED_FILES }) });
      sessionId = session.sessionId;
      if (!session.pickerUri) throw new Error('Google Photos did not return a picker page.');
      if (popup) popup.location.href = session.pickerUri; else window.open(session.pickerUri, '_blank', 'noopener,noreferrer');
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await sleep(3000);
        const status = await apiFetch(`/smart-sync/google-photos/session?sessionId=${encodeURIComponent(sessionId)}`);
        if (status.ready) {
          if (popup && !popup.closed) popup.close();
          setPhotoJob(status.job || null);
          toast.success(`${status.itemCount || 0} selected Google Photos items are ready.`);
          if (status.job) await runPhotoJob(status.job);
          return;
        }
      }
      throw new Error('Google Photos selection timed out. Start a new selection when ready.');
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      if (sessionId) await apiFetch(`/smart-sync/google-photos/session?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
      toast.error(error.message || 'Google Photos selection could not finish.');
    } finally { setBusy(''); }
  }

  return <div className="mx-auto max-w-5xl space-y-7 pb-24">
    <header>
      <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-100"><CloudDownload className="h-3.5 w-3.5" /> SMART IMPORT</div>
      <h1 className="mt-3 text-3xl font-black sm:text-4xl">Bring in only what you choose</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">SnapNext launch imports are user-selected. We do not need permanent access to your entire cloud library, and importing never deletes or changes the original file.</p>
    </header>

    <section className="grid gap-4 md:grid-cols-2">
      <ProviderCard title="Google Photos" icon={ImageIcon} status={photos?.connected ? 'Connected for picker' : 'User-selected picker'} description="Choose specific photos and videos in Google's picker. The selection becomes a resumable SnapNext import job." actionLabel={photos?.connected ? 'Choose Google Photos' : 'Connect Google Photos'} onAction={chooseGooglePhotos} busy={busy.startsWith('photos')} connected={photos?.connected} onDisconnect={() => disconnect('google_photos')} testId="smart-import-google-photos" />
      <ProviderCard title="Google Drive" icon={HardDrive} status={drive?.connected ? 'Connected for picker' : 'User-selected picker'} description="Drive uses the narrow per-file permission. SnapNext can copy only files you choose in Google's Picker." actionLabel={drive?.connected ? 'Choose from Google Drive' : 'Connect Google Drive'} onAction={drive?.connected ? openGooglePicker : connectDrive} busy={busy.startsWith('drive') || busy === 'connect-drive'} connected={drive?.connected} onDisconnect={() => disconnect('google_drive')} testId="drive-open-picker" />
    </section>

    {driveItems.length > 0 && <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Google Drive selection</h2><p className="mt-1 text-sm text-white/45">{selected.length} selected · up to {MAX_SELECTED_FILES} per import</p></div><button onClick={importDriveSelected} disabled={busy === 'drive-import'} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black disabled:opacity-50">{busy === 'drive-import' ? 'Importing…' : 'Import selected'}</button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{driveItems.map(item => <label key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/10 p-3"><input type="checkbox" checked={selectedSet.has(item.id)} onChange={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id].slice(0, MAX_SELECTED_FILES))} /><span className="min-w-0 truncate text-sm font-semibold">{item.name}</span></label>)}</div>
      {driveProgress && <p className="mt-4 text-xs text-white/50">{driveProgress.completed}/{driveProgress.total} checked · {driveProgress.saved} saved · {driveProgress.skipped} already safe · {driveProgress.failed} failed</p>}
    </section>}

    {photoJob && <section className="rounded-3xl border border-cyan-300/15 bg-cyan-400/[0.05] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Google Photos import</h2><p className="mt-1 text-sm text-white/50">{photoJob.processedItems || 0}/{photoJob.fileCount || photoJob.estimatedItems || 0} processed · status {photoJob.status}</p></div>{['queued','failed'].includes(photoJob.status) && <button onClick={() => resumePhotoJob(photoJob)} disabled={busy === 'photos-import' || busy === 'photos-retry'} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Resume import</button>}</div></section>}

    <section className="grid gap-4 md:grid-cols-2">
      <FutureCard title="Dropbox" connected={legacy.dropbox?.connected} onDisconnect={() => disconnect('dropbox')} busy={busy === 'disconnect:dropbox'} />
      <FutureCard title="OneDrive" connected={legacy.onedrive?.connected} onDisconnect={() => disconnect('onedrive')} busy={busy === 'disconnect:onedrive'} />
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/8"><Smartphone className="h-5 w-5 text-pink-100" /></div><div className="flex-1"><h2 className="font-black">Device library and files</h2><p className="mt-1 text-sm leading-6 text-white/45">For iPhone, Android, Dropbox downloads, OneDrive downloads, external drives or folders on your computer, use the normal Add flow. No cloud account connection is required.</p><Link href="/upload/discover" className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-black"><FileUp className="h-3.5 w-3.5" /> Open Add</Link></div></div>
    </section>

    <div className="flex items-start gap-3 rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.05] p-5"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><p className="text-sm leading-6 text-emerald-100/65"><strong className="text-emerald-50">Launch privacy rule:</strong> user-selected import is the default. Auto Cloud Sync is a future premium capability, not a hidden requirement for using SnapNext.</p></div>
  </div>;
}

function ProviderCard({ title, icon: Icon, status, description, actionLabel, onAction, busy, connected, onDisconnect, testId }) {
  return <div data-testid={testId} className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5"><div className="flex items-start justify-between gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-400/10"><Icon className="h-5 w-5 text-cyan-100" /></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/50">{status}</span></div><h2 className="mt-4 text-xl font-black">{title}</h2><p className="mt-2 min-h-16 text-sm leading-6 text-white/45">{description}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={onAction} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-black text-black disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}{actionLabel}</button>{connected && <button onClick={onDisconnect} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-bold"><Unplug className="h-3.5 w-3.5" /> Disconnect</button>}</div></div>;
}

function FutureCard({ title, connected, onDisconnect, busy }) {
  return <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-black">{title}</h2><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-100">Picker later</span></div><p className="mt-2 text-sm leading-6 text-white/45">No new permanent/background OAuth connection is created at launch. Download/select the files and use Add today.</p>{connected && <button onClick={onDisconnect} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200/15 px-4 py-2 text-xs font-bold text-amber-100"><Unplug className="h-3.5 w-3.5" /> Remove legacy connection</button>}</div>;
}
