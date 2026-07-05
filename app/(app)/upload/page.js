'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Cloud, FileImage, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck, Sparkles, Upload, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';

const STATUS = {
  queued: { label: 'Waiting', icon: AlertCircle, cls: 'text-white/45 bg-white/8' },
  uploading: { label: 'Saving', icon: Loader2, cls: 'text-cyan-200 bg-cyan-400/10' },
  done: { label: 'Saved', icon: CheckCircle2, cls: 'text-emerald-200 bg-emerald-400/10' },
  skipped: { label: 'Skipped', icon: AlertCircle, cls: 'text-amber-200 bg-amber-400/10' },
  error: { label: 'Failed', icon: XCircle, cls: 'text-rose-200 bg-rose-400/10' },
};

const REASON_COPY = {
  duplicate: 'Already backed up',
  storage_full: 'Storage full',
  too_large: 'File too large',
  unsupported_type: 'Unsupported type',
  authentication_expired: 'Session expired',
  storage_unavailable: 'Upload service unavailable',
  unrecognized_status: 'Unclear upload status',
};

function makeId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2);
}

function itemStatus(item) {
  return STATUS[item.status] || STATUS.queued;
}

export default function UploadPage() {
  const fileRef = useRef(null);
  const [usage, setUsage] = useState(null);
  const [queue, setQueue] = useState([]);
  const [previews, setPreviews] = useState({});
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => { apiFetch('/storage/usage').then(setUsage).catch(() => {}); }, []);
  useEffect(() => () => Object.values(previews).forEach((url) => { try { URL.revokeObjectURL(url); } catch {} }), [previews]);
  useEffect(() => {
    if (!uploading) return;
    const onBeforeUnload = (event) => { event.preventDefault(); event.returnValue = 'Upload in progress.'; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [uploading]);

  const stats = useMemo(() => {
    const total = queue.length;
    const saved = queue.filter((i) => i.status === 'done').length;
    const skipped = queue.filter((i) => i.status === 'skipped').length;
    const failed = queue.filter((i) => i.status === 'error').length;
    const active = queue.filter((i) => i.status === 'uploading').length;
    const waiting = queue.filter((i) => i.status === 'queued' && i.checked).length;
    const uploadableBytes = queue.filter((i) => i.checked && ['queued', 'error'].includes(i.status)).reduce((sum, i) => sum + i.size, 0);
    const savedOrSkipped = saved + skipped + failed;
    return { total, saved, skipped, failed, active, waiting, uploadableBytes, percent: total ? Math.round((savedOrSkipped / total) * 100) : 0 };
  }, [queue]);

  function addFiles(files) {
    const accepted = [];
    const nextPreviews = { ...previews };
    for (const file of files) {
      if (!file.type?.startsWith('image/') && !file.type?.startsWith('video/')) continue;
      if (queue.some((item) => item.name === file.name && item.size === file.size)) continue;
      const id = makeId();
      if (file.type.startsWith('image/')) {
        try { nextPreviews[id] = URL.createObjectURL(file); } catch {}
      }
      accepted.push({ id, file, name: file.name, size: file.size, type: file.type, checked: true, status: 'queued', progress: 0, reason: null, message: null, retryable: true });
    }
    if (!accepted.length) return toast.error('No new photos or videos selected.');
    setQueue((prev) => [...prev, ...accepted]);
    setPreviews(nextPreviews);
    setSummary(null);
    toast.success(`Added ${accepted.length} files`);
  }

  function onSelect(event) {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  }

  function updateItem(id, patch) {
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function removeItem(id) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    if (previews[id]) {
      try { URL.revokeObjectURL(previews[id]); } catch {}
      const copy = { ...previews };
      delete copy[id];
      setPreviews(copy);
    }
  }

  function clearDone() {
    setQueue((prev) => prev.filter((item) => !['done', 'skipped'].includes(item.status)));
  }

  async function uploadOne(item) {
    updateItem(item.id, { status: 'uploading', progress: 0, reason: null, message: null });
    const form = new FormData();
    form.append('files', item.file, item.name);
    try {
      const token = localStorage.getItem('snapnext_token');
      const response = await axios.post('/api/media/upload', form, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        onUploadProgress: (event) => {
          const total = event.total || item.size || 1;
          updateItem(item.id, { progress: Math.min(99, Math.round(((event.loaded || 0) / total) * 100)) });
        },
      });
      const data = response.data || {};
      const saved = new Set((data.saved || []).map((m) => m.name));
      const skipped = (data.skipped || []).find((m) => m.name === item.name);
      if (saved.has(item.name)) {
        updateItem(item.id, { status: 'done', progress: 100 });
        return 'saved';
      }
      if (skipped) {
        const reason = skipped.reason || 'storage_unavailable';
        updateItem(item.id, { status: reason === 'duplicate' ? 'skipped' : 'error', progress: 100, reason, message: skipped.message, retryable: skipped.retryable !== false });
        return reason === 'duplicate' ? 'skipped' : 'failed';
      }
      updateItem(item.id, { status: 'error', progress: 0, reason: 'unrecognized_status', retryable: true });
      return 'failed';
    } catch (error) {
      const reason = error.response?.status === 401 ? 'authentication_expired' : error.response?.data?.reason || 'storage_unavailable';
      const message = error.response?.data?.error || error.message || 'Upload failed';
      updateItem(item.id, { status: 'error', progress: 0, reason, message, retryable: error.response?.status !== 401 });
      return 'failed';
    }
  }

  async function startBackup() {
    if (uploading) return;
    const items = queue.filter((item) => item.checked && ['queued', 'error'].includes(item.status));
    if (!items.length) return toast.error('Choose files to back up first.');

    // Important: do not reject the entire batch if selected size exceeds remaining storage.
    // The server already greedily saves what fits and returns skip reasons for the rest.
    setUploading(true);
    setSummary(null);
    const counts = { saved: 0, skipped: 0, failed: 0, total: items.length };
    for (const item of items) {
      const outcome = await uploadOne(item);
      if (outcome === 'saved') counts.saved += 1;
      else if (outcome === 'skipped') counts.skipped += 1;
      else counts.failed += 1;
    }
    setUploading(false);
    setSummary(counts);
    apiFetch('/storage/usage').then(setUsage).catch(() => {});
    toast.success(`Uploading complete: ${counts.saved} saved · ${counts.skipped + counts.failed} skipped/failed`);
  }

  const planName = usage?.plan?.name || usage?.planName || 'Current plan';
  const used = usage?.usage?.bytes || 0;
  const total = usage?.plan?.storageBytes || 0;
  const isSuper = !!usage?.isSuper;
  const usedPct = total && !isSuper ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const reasonCounts = queue.reduce((acc, item) => {
    if (item.reason) acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-36 md:pb-12">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-600/10 to-cyan-500/10 p-5 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-100/70">Safe backup</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">Back up photos and videos</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">Keep your memories safe, forever. SnapNext uploads as much as fits and clearly explains anything skipped.</p>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-6 py-3 text-sm font-black text-white shadow-xl shadow-pink-950/30 disabled:opacity-60">
            <Upload className="h-4 w-4" /> Choose specific files
          </button>
        </div>
        <input ref={fileRef} type="file" multiple accept="image/*,video/*" onChange={onSelect} className="hidden" />
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/50">On mobile web, SnapNext can only see files you pick. The native app can quietly back up everything later when that platform support is available.</div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">{uploading ? 'Backing up now' : stats.total ? 'Ready to back up' : 'All caught up'}</h2>
            <p className="mt-1 text-sm text-white/50">{stats.saved} saved · {stats.skipped} skipped · {stats.failed} failed · {stats.waiting} waiting</p>
          </div>
          <button onClick={startBackup} disabled={uploading || !stats.waiting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-40">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />} {uploading ? 'Saving…' : 'Start backup'}
          </button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-pink-500 to-purple-600 transition-all" style={{ width: `${stats.percent}%` }} /></div>
        {summary && <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100"><CheckCircle2 className="mr-2 inline h-4 w-4" /> Batch complete: {summary.saved} saved, {summary.skipped + summary.failed} not saved.</div>}
      </section>

      {!!Object.keys(reasonCounts).length && (
        <section className="rounded-[2rem] border border-amber-400/20 bg-amber-400/10 p-5">
          <h2 className="text-lg font-black text-white">Why some files were skipped</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(reasonCounts).map(([reason, count]) => <div key={reason} className="rounded-2xl bg-black/20 p-3 text-sm text-white/70"><AlertCircle className="mr-2 inline h-4 w-4 text-amber-200" />{REASON_COPY[reason] || reason}: <b>{count}</b></div>)}
          </div>
          <p className="mt-3 text-xs text-white/45">Your original local files are never deleted by SnapNext.</p>
        </section>
      )}

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Storage</p><h2 className="mt-2 text-xl font-black text-white">{isSuper ? 'Unlimited storage' : `${formatBytes(used)} of ${formatBytes(total)} used`}</h2><p className="mt-1 text-sm text-white/45">{planName}</p></div>{!isSuper && <Link href="/billing" className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white">Get more space</Link>}</div>
        {!isSuper && <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" style={{ width: `${usedPct}%` }} /></div>}
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-200" /><div><h2 className="text-lg font-black text-white">Preferences</h2><p className="mt-1 text-sm text-white/50">Silent background backup and Wi‑Fi-only automation are native-app features. This web app backs up only the files you choose.</p></div></div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-white">Current queue</h2><p className="mt-1 text-sm text-white/45">{stats.total} files · {formatBytes(stats.uploadableBytes)} selected for upload</p></div><div className="flex gap-2"><button onClick={() => setQueue((prev) => prev.map((i) => ['queued', 'error'].includes(i.status) ? { ...i, checked: true } : i))} disabled={uploading} className="rounded-full bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/70">Select all</button><button onClick={clearDone} disabled={uploading} className="rounded-full bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/70">Clear saved</button></div></div>
        <div className="mt-4 grid gap-3">
          {queue.length === 0 ? <button onClick={() => fileRef.current?.click()} className="grid min-h-48 place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center"><div><FileImage className="mx-auto h-8 w-8 text-pink-200" /><p className="mt-3 font-bold text-white">Choose photos and videos</p><p className="mt-1 text-sm text-white/45">SnapNext will show progress and skip reasons clearly.</p></div></button> : queue.map((item) => {
            const status = itemStatus(item);
            const Icon = status.icon;
            return <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3"><input type="checkbox" checked={item.checked} disabled={uploading || !['queued', 'error'].includes(item.status)} onChange={(e) => updateItem(item.id, { checked: e.target.checked })} className="h-5 w-5 rounded" />{previews[item.id] ? <img src={previews[item.id]} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-white/[0.05]"><ImageIcon className="h-5 w-5 text-white/35" /></div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{item.name}</p><p className="mt-1 text-xs text-white/42">{formatBytes(item.size)} · {REASON_COPY[item.reason] || item.message || ''}</p>{item.status === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${item.progress}%` }} /></div>}</div><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}><Icon className={`h-3.5 w-3.5 ${item.status === 'uploading' ? 'animate-spin' : ''}`} />{status.label}</span><button onClick={() => removeItem(item.id)} disabled={uploading} className="rounded-full p-2 text-white/40 hover:bg-white/5"><XCircle className="h-4 w-4" /></button></div>;
          })}
        </div>
      </section>
    </div>
  );
}
