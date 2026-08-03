'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Cloud, CloudDownload, ImagePlus, Loader2, LogOut, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import CloudImportBatchGuide from '@/components/CloudImportBatchGuide';
import { toast } from 'sonner';

// Providers come from the live registry (/smart-sync), never a hardcoded list.
// The old hardcoded copy claimed Dropbox and OneDrive were "coming soon" long
// after both were fully implemented, and omitted Google Photos entirely.
const PROVIDER_ICONS = {
  google_drive: '💾',
  google_photos: '🖼️',
  dropbox: '📦',
  onedrive: '📂',
  ios_photos: '📱',
  android_media: '🤖',
};

const IMPORT_BATCH_SIZE = 10;
const MAX_SELECTED_FILES = 500;

function readableSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

export default function ImportsPage() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [showChoices, setShowChoices] = useState(false);
  const [progress, setProgress] = useState(null);
  const [providers, setProviders] = useState([]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allLoadedSelected = items.length > 0 && items.every(item => selectedSet.has(item.id));

  // Files are chosen in Google's own Picker rather than listed here. SnapNext
  // asks for the per-file `drive.file` scope, which cannot read a whole Drive —
  // so there is nothing to page through, and no restricted-scope security
  // assessment standing between this feature and launch.
  async function loadFiles() {
    setItems([]);
    setNextPageToken(null);
    return { items: [] };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const element = document.createElement('script');
      element.src = src;
      element.onload = () => resolve();
      element.onerror = () => reject(new Error('Google Picker could not be loaded.'));
      document.body.appendChild(element);
    });
  }

  async function openGooglePicker() {
    setBusy('picker');
    try {
      const auth = await apiFetch('/cloud/google-drive/picker-token');
      if (!auth.accessToken) throw new Error('Connect Google Drive first.');
      if (!auth.apiKey) throw new Error('Google Picker is not configured for this deployment yet.');

      await loadScript('https://apis.google.com/js/api.js');
      await new Promise(resolve => window.gapi.load('picker', resolve));

      const picked = await new Promise((resolve) => {
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
          .setIncludeFolders(true)
          .setMimeTypes('image/png,image/jpeg,image/heic,image/webp,video/mp4,video/quicktime');

        const builder = new window.google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(auth.accessToken)
          .setDeveloperKey(auth.apiKey)
          .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
          .setCallback((data) => {
            if (data.action === window.google.picker.Action.PICKED) resolve(data.docs || []);
            else if (data.action === window.google.picker.Action.CANCEL) resolve([]);
          });

        if (auth.appId) builder.setAppId(auth.appId);
        builder.build().setVisible(true);
      });

      if (!picked.length) return;
      if (picked.length > MAX_SELECTED_FILES) {
        toast.error(`Choose up to ${MAX_SELECTED_FILES} items at a time.`);
        return;
      }

      setItems(picked.map(doc => ({
        id: doc.id,
        name: doc.name,
        mime: doc.mimeType,
        size: Number(doc.sizeBytes || 0),
        importState: 'available_to_import',
      })));
      setSelected(picked.map(doc => doc.id));
      toast.success(`${picked.length} ${picked.length === 1 ? 'item' : 'items'} chosen. Review and bring them in.`);
    } catch (error) {
      toast.error(error.message || 'Google Picker could not be opened.');
    } finally {
      setBusy('');
    }
  }

  async function loadStatus() {
    setLoading(true);
    try {
      // Provider readiness is a deployment fact, so it is read from the same
      // registry Smart Backup uses rather than assumed here.
      const [next, sync] = await Promise.all([
        apiFetch('/cloud/google-drive/status'),
        apiFetch('/smart-sync/providers').catch(() => ({ providers: [] })),
      ]);
      setProviders(sync.providers || []);
      setStatus(next);
      if (next.connected) await loadFiles('', false);
      else {
        setItems([]);
        setSelected([]);
        setNextPageToken(null);
      }
    } catch (error) {
      toast.error(error.message || 'We could not open cloud import.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('cloud') === 'connected') toast.success('Your cloud is connected. Choose the memories you want to bring into SnapNext.');
    if (query.get('cloud') === 'cancelled') toast.message('Nothing changed. You can connect whenever you are ready.');
    if (query.get('cloud') === 'failed') toast.error('We could not connect your cloud. Please try again.');
    loadStatus();
  }, []);

  async function connectGoogleDrive() {
    setBusy('connect');
    try {
      const result = await apiFetch('/cloud/google-drive/start');
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(error.message || 'This cloud option is not ready yet.');
      setBusy('');
    }
  }

  async function chooseProvider(provider) {
    if (provider.surface === 'native') {
      toast.message(`${provider.name} syncs from the SnapNext mobile app, where photo access can be granted.`);
      return;
    }
    if (!provider.available) {
      toast.message(`${provider.name} is not connected in this deployment yet. You can still upload directly today.`);
      return;
    }

    setShowChoices(false);
    // Google Drive keeps its own connect route and browsing UI on this page;
    // every other cloud connects through the shared Smart Sync OAuth adapter
    // and is then managed from Smart Backup.
    if (provider.id === 'google_drive') {
      connectGoogleDrive();
      return;
    }

    setBusy(`connect:${provider.id}`);
    try {
      const result = await apiFetch(`/smart-sync/oauth/${provider.id}/start`);
      if (!result.authorizationUrl) throw new Error('That cloud did not return a connection page.');
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(error.message || `Could not connect ${provider.name}.`);
      setBusy('');
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await apiFetch('/cloud/google-drive/status', { method: 'DELETE' });
      setStatus({ ...status, connected: false });
      setItems([]);
      setSelected([]);
      setNextPageToken(null);
      toast.success('Your cloud was disconnected. Memories already saved in SnapNext are still safe.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  }

  async function loadMore() {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadFiles(nextPageToken, true);
    } catch (error) {
      toast.error(error.message || 'We could not load more memories.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadAll() {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      let token = nextPageToken;
      let pages = 0;
      while (token && pages < 100) {
        const files = await loadFiles(token, true);
        token = files.nextPageToken || null;
        pages += 1;
      }
      toast.success(token ? 'We loaded a large part of your Drive. You can continue loading more.' : 'Your complete available Drive library is loaded.');
    } catch (error) {
      toast.error(error.message || 'We could not load the complete library.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function importSelected() {
    if (!selected.length) return toast.error('Choose at least one photo or video.');
    setBusy('import');
    const batches = chunk(selected, IMPORT_BATCH_SIZE);
    const totals = { saved: 0, skipped: 0, failed: 0 };
    setProgress({ completed: 0, total: selected.length, saved: 0, skipped: 0, failed: 0 });

    try {
      for (const batch of batches) {
        const result = await apiFetch('/cloud/google-drive/import', {
          method: 'POST',
          body: JSON.stringify({ fileIds: batch }),
        });
        totals.saved += result.saved || 0;
        totals.skipped += result.skipped || 0;
        totals.failed += result.failed || 0;
        setProgress({
          completed: Math.min(selected.length, totals.saved + totals.skipped + totals.failed),
          total: selected.length,
          ...totals,
        });
      }

      const parts = [];
      if (totals.saved) parts.push(`${totals.saved} saved`);
      if (totals.skipped) parts.push(`${totals.skipped} already safe`);
      if (totals.failed) parts.push(`${totals.failed} could not be copied`);
      toast.success(parts.join(' · ') || 'Your import is complete.');
      setSelected([]);
    } catch (error) {
      toast.error(error.message || 'We could not finish this import. Files already completed remain safely saved.');
    } finally {
      setBusy('');
    }
  }

  function toggle(id) {
    setSelected(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= MAX_SELECTED_FILES) {
        toast.message(`You can import up to ${MAX_SELECTED_FILES} files in one job.`);
        return current;
      }
      return [...current, id];
    });
  }

  function toggleAllLoaded() {
    if (allLoadedSelected) {
      const loaded = new Set(items.map(item => item.id));
      setSelected(current => current.filter(id => !loaded.has(id)));
      return;
    }
    const combined = [...new Set([...selected, ...items.map(item => item.id)])].slice(0, MAX_SELECTED_FILES);
    setSelected(combined);
    if (items.length > MAX_SELECTED_FILES) toast.message(`The first ${MAX_SELECTED_FILES} loaded files were selected.`);
  }

  return (
    <div className="space-y-7 pb-16">
      <header>
        <h1 className="text-3xl font-black bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">Connect your cloud</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Bring your photos and videos into SnapNext with your permission. Your originals stay where they are, and nothing is deleted from another service.</p>
      </header>

      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-blue-500/10 via-white/[0.035] to-purple-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-xl">☁️</div>
            <div>
              <h2 className="text-lg font-black">Your connected cloud</h2>
              <p className="mt-1 text-sm text-white/55">Browse your available Drive library and choose what you want to save in SnapNext.</p>
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-white/45"><ShieldCheck className="h-4 w-4"/> SnapNext only copies the memories you choose. It cannot delete your originals.</div>
            </div>
          </div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-white/50"/> : status?.connected ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200"><Check className="h-4 w-4"/> Connected</span>
          ) : <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold text-white/55">Not connected</span>}
        </div>

        {!loading && !status?.connected && (
          <div className="mt-5">
            <button onClick={() => setShowChoices(true)} disabled={busy === 'connect'} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-45">
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Cloud className="h-4 w-4"/>} Connect your cloud
            </button>
            {!status?.configured && <p className="mt-3 text-xs text-amber-100/75">Cloud connection is being prepared. Your normal uploads are available now.</p>}
          </div>
        )}

        {status?.connected && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black">Choose memories to bring in</h3>
                <p className="mt-1 text-xs text-white/45">{items.length} chosen · {selected.length} selected · up to {MAX_SELECTED_FILES} per import job</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Selection happens in Google's own window. SnapNext only ever
                    receives the files chosen there — it cannot see the rest of
                    the Drive, by design. */}
                <button data-testid="drive-open-picker" onClick={openGooglePicker} disabled={busy === 'picker' || busy === 'import'} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black disabled:opacity-45">
                  {busy === 'picker' ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <CloudDownload className="h-3.5 w-3.5"/>} Choose from Google Drive
                </button>
                <button onClick={toggleAllLoaded} disabled={!items.length || busy === 'import'} className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold">{allLoadedSelected ? 'Clear chosen' : 'Select all chosen'}</button>
                <button onClick={loadStatus} disabled={busy === 'import'} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5"/> Refresh</button>
                <button onClick={disconnect} disabled={busy === 'disconnect' || busy === 'import'} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-white/60"><LogOut className="h-3.5 w-3.5"/> Disconnect</button>
              </div>
            </div>

            <CloudImportBatchGuide selected={selected.length} batchSize={IMPORT_BATCH_SIZE} maxFiles={MAX_SELECTED_FILES} progress={progress} />

            {items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(item => {
                  const active = selectedSet.has(item.id);
                  return <button key={item.id} onClick={() => toggle(item.id)} disabled={busy === 'import'} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-60 ${active ? 'border-pink-400 bg-pink-500/10' : 'border-white/10 bg-black/15 hover:bg-white/[0.05]'}`}>
                    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5">{item.thumbnail ? <img src={item.thumbnail} alt="" className="h-full w-full object-cover"/> : item.mime?.startsWith('video/') ? '🎬' : '🖼️'}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{item.name}</div><div className="mt-1 text-xs text-white/40">{item.mime?.startsWith('video/') ? 'Video' : 'Photo'}{item.size ? ` · ${readableSize(item.size)}` : ''}</div></div>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${active ? 'border-pink-400 bg-pink-500' : 'border-white/20'}`}>{active && <Check className="h-3.5 w-3.5"/>}</span>
                  </button>;
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                <p className="text-sm text-white/55">Nothing chosen yet.</p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-white/40">Open Google Drive to pick the photos and videos you want. SnapNext only ever sees the items you choose — it cannot browse the rest of your Drive.</p>
                <button data-testid="drive-open-picker-empty" onClick={openGooglePicker} disabled={busy === 'picker'} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black disabled:opacity-45">
                  {busy === 'picker' ? <Loader2 className="h-4 w-4 animate-spin"/> : <CloudDownload className="h-4 w-4"/>} Choose from Google Drive
                </button>
              </div>
            )}

            {progress && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                <div className="flex items-center justify-between text-sm font-bold"><span>Import progress</span><span>{progress.completed}/{progress.total}</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%` }}/></div>
                <p className="mt-2 text-xs text-white/55">{progress.saved} saved · {progress.skipped} already safe · {progress.failed} failed</p>
              </div>
            )}

            <button onClick={importSelected} disabled={!selected.length || busy === 'import'} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black disabled:opacity-40">
              {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin"/> : <CloudDownload className="h-4 w-4"/>} {busy === 'import' ? `Importing ${progress?.completed || 0}/${progress?.total || selected.length}…` : `Save ${selected.length || ''} selected`}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-7 text-center">
        <ImagePlus className="mx-auto h-7 w-7 text-pink-300"/>
        <h2 className="mt-3 text-lg font-black">You can always upload directly</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/55">Choose photos and videos from your phone or computer. SnapNext checks for duplicates automatically.</p>
        <Link href="/upload" className="mt-4 inline-flex items-center gap-2 rounded-full bg-pink-500 px-5 py-3 text-sm font-black"><ImagePlus className="h-4 w-4"/> Choose photos and videos</Link>
      </section>

      {showChoices && (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={() => setShowChoices(false)}>
          <div className="w-full max-w-lg rounded-t-[2rem] border border-white/10 bg-[#12081d] p-5 shadow-2xl sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-black">Where are your memories?</h2><p className="mt-1 text-sm text-white/50">Choose a cloud service. You will sign in securely on that service’s own page.</p></div>
              <button onClick={() => setShowChoices(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/5"><X className="h-4 w-4"/></button>
            </div>
            <div className="mt-5 space-y-2" data-testid="cloud-provider-list">
              {!providers.length && <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">Checking which clouds are available…</p>}
              {providers.map(provider => {
                const label = provider.connected
                  ? 'Connected'
                  : provider.surface === 'native'
                    ? 'Mobile app'
                    : provider.available
                      ? 'Connect'
                      : 'Not set up';
                const dimmed = !provider.connected && !provider.available;
                return (
                  <button
                    key={provider.id}
                    data-testid={`cloud-provider-${provider.id}`}
                    onClick={() => chooseProvider(provider)}
                    disabled={busy.startsWith('connect:')}
                    className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left hover:bg-white/[0.06] disabled:opacity-50 ${dimmed ? 'opacity-60' : ''}`}
                  >
                    <span className="text-2xl">{PROVIDER_ICONS[provider.id] || '☁️'}</span>
                    <span className="min-w-0 flex-1"><span className="block font-black">{provider.name}</span><span className="mt-0.5 block text-xs leading-5 text-white/45">{provider.description}</span></span>
                    <span className="flex items-center gap-2 text-xs font-bold text-white/50">
                      {busy === `connect:${provider.id}` ? <Loader2 className="h-4 w-4 animate-spin"/> : label}
                      <ChevronRight className="h-4 w-4"/>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-white/35">Connected clouds are read-only. SnapNext never changes or deletes anything in the original account. Ongoing automatic backup is set up in <Link href="/smart-sync" className="text-pink-200 underline">Smart Backup</Link>.</p>
          </div>
        </div>
      )}
    </div>
  );
}
