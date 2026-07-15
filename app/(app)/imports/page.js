'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Cloud, CloudDownload, ImagePlus, Loader2, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const OTHER_PROVIDERS = [
  { name: 'Dropbox', icon: '📦', note: 'Coming next' },
  { name: 'Microsoft OneDrive', icon: '📂', note: 'Coming next' },
  { name: 'Apple Photos', icon: '☁️', note: 'Will use the SnapNext mobile app' },
];

function readableSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function ImportsPage() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function loadStatus() {
    setLoading(true);
    try {
      const next = await apiFetch('/cloud/google-drive/status');
      setStatus(next);
      if (next.connected) {
        const files = await apiFetch('/cloud/google-drive/files');
        setItems(files.items || []);
      }
    } catch (error) {
      toast.error(error.message || 'We could not open Cloud Sync.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('cloud') === 'connected') toast.success('Google Drive is connected. Choose the memories you want to bring into SnapNext.');
    if (query.get('cloud') === 'cancelled') toast.message('Nothing changed. You can connect whenever you are ready.');
    if (query.get('cloud') === 'failed') toast.error('We could not connect Google Drive. Please try again.');
    loadStatus();
  }, []);

  async function connect() {
    setBusy('connect');
    try {
      const result = await apiFetch('/cloud/google-drive/start');
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(error.message || 'Google Drive is not ready to connect yet.');
      setBusy('');
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await apiFetch('/cloud/google-drive/status', { method: 'DELETE' });
      setStatus({ ...status, connected: false });
      setItems([]); setSelected([]);
      toast.success('Google Drive was disconnected. Photos already saved in SnapNext are still safe.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function importSelected() {
    if (!selected.length) return toast.error('Choose at least one photo or video.');
    setBusy('import');
    try {
      const result = await apiFetch('/cloud/google-drive/import', { method: 'POST', body: JSON.stringify({ fileIds: selected }) });
      const parts = [];
      if (result.saved) parts.push(`${result.saved} saved`);
      if (result.skipped) parts.push(`${result.skipped} already safe`);
      if (result.failed) parts.push(`${result.failed} could not be copied`);
      toast.success(parts.join(' · ') || 'Your import is complete.');
      setSelected([]);
    } catch (error) { toast.error(error.message || 'We could not finish this import.'); }
    finally { setBusy(''); }
  }

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 10 ? current : [...current, id]);
  }

  return (
    <div className="space-y-7 pb-16">
      <header>
        <h1 className="text-3xl font-black bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">Cloud Sync</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Bring your photos and videos into SnapNext with your permission. Your originals stay where they are, and nothing is deleted from another service.</p>
      </header>

      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-blue-500/10 via-white/[0.035] to-purple-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-xl">💾</div>
            <div>
              <h2 className="text-lg font-black">Google Drive</h2>
              <p className="mt-1 text-sm text-white/55">Choose photos and videos from your Drive and save private copies in SnapNext.</p>
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-white/45"><ShieldCheck className="h-4 w-4"/> Read-only permission. SnapNext cannot edit or delete your Drive files.</div>
            </div>
          </div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-white/50"/> : status?.connected ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200"><Check className="h-4 w-4"/> Connected</span>
          ) : <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold text-white/55">Not connected</span>}
        </div>

        {!loading && !status?.connected && (
          <div className="mt-5">
            <button onClick={connect} disabled={busy === 'connect' || !status?.configured} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-45">
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Cloud className="h-4 w-4"/>} Connect Google Drive
            </button>
            {!status?.configured && <p className="mt-3 text-xs text-amber-100/75">Google Drive is being prepared for SnapNext. Your normal uploads are available now.</p>}
          </div>
        )}

        {status?.connected && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black">Choose memories to bring in</h3>
                <p className="mt-1 text-xs text-white/45">You can copy up to 10 at a time. SnapNext skips anything already saved.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={loadStatus} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5"/> Refresh</button>
                <button onClick={disconnect} disabled={busy === 'disconnect'} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-white/60"><LogOut className="h-3.5 w-3.5"/> Disconnect</button>
              </div>
            </div>

            {items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(item => {
                  const active = selectedSet.has(item.id);
                  return <button key={item.id} onClick={() => toggle(item.id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-pink-400 bg-pink-500/10' : 'border-white/10 bg-black/15 hover:bg-white/[0.05]'}`}>
                    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5">{item.thumbnail ? <img src={item.thumbnail} alt="" className="h-full w-full object-cover"/> : item.mime?.startsWith('video/') ? '🎬' : '🖼️'}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{item.name}</div><div className="mt-1 text-xs text-white/40">{item.mime?.startsWith('video/') ? 'Video' : 'Photo'}{item.size ? ` · ${readableSize(item.size)}` : ''}</div></div>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${active ? 'border-pink-400 bg-pink-500' : 'border-white/20'}`}>{active && <Check className="h-3.5 w-3.5"/>}</span>
                  </button>;
                })}
              </div>
            ) : <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">No photos or videos were found in this Drive account.</div>}

            <button onClick={importSelected} disabled={!selected.length || busy === 'import'} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black disabled:opacity-40">
              {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin"/> : <CloudDownload className="h-4 w-4"/>} {busy === 'import' ? 'Saving your memories…' : `Save ${selected.length || ''} selected`}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-black">More ways to connect</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {OTHER_PROVIDERS.map(provider => <div key={provider.name} className="rounded-3xl border border-white/10 bg-white/[0.025] p-5"><div className="text-2xl">{provider.icon}</div><h3 className="mt-3 font-black">{provider.name}</h3><p className="mt-1 text-xs leading-5 text-white/45">{provider.note}</p><span className="mt-4 inline-block rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-white/45">Coming soon</span></div>)}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-7 text-center">
        <ImagePlus className="mx-auto h-7 w-7 text-pink-300"/>
        <h2 className="mt-3 text-lg font-black">You can always upload directly</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/55">Choose photos and videos from your phone or computer. SnapNext checks for duplicates automatically.</p>
        <Link href="/upload" className="mt-4 inline-flex items-center gap-2 rounded-full bg-pink-500 px-5 py-3 text-sm font-black"><ImagePlus className="h-4 w-4"/> Choose photos and videos</Link>
      </section>
    </div>
  );
}
