'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Cloud, FileImage, Image as ImageIcon, Loader2, ShieldCheck, Sparkles, Upload, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';

const SMART_BATCH_THRESHOLD = 10;
const WEB_SAFE_BATCH_MAX = 20;
const FILELIST_INTAKE_CHUNK = 6;
const LARGE_PREVIEW_LIMIT = 6;
const LARGE_QUEUE_VISIBLE = 12;

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

const MEDIA_EXTENSION = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|tif|tiff|webp|3gp|avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i;
const PHOTO_EXTENSION = /\.(heic|heif|jpeg|jpg|png|webp)$/i;

function makeId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2);
}

function itemStatus(item) {
  return STATUS[item.status] || STATUS.queued;
}

function isMediaFile(file) {
  return file?.type?.startsWith('image/') || file?.type?.startsWith('video/') || MEDIA_EXTENSION.test(file?.name || '');
}

function fileKey(file) {
  return `${file?.name || ''}:${file?.size || 0}:${file?.lastModified || 0}`;
}

function NativeMediaPicker({ children, disabled, onSelect, className = '' }) {
  return (
    <label className={`relative cursor-pointer overflow-hidden ${disabled ? 'pointer-events-none opacity-60' : ''} ${className}`}>
      {children}
      <input
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={onSelect}
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Choose photos and videos"
      />
    </label>
  );
}

export default function UploadPage() {
  const [usage, setUsage] = useState(null);
  const [queue, setQueue] = useState([]);
  const [previews, setPreviews] = useState({});
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [largeMode, setLargeMode] = useState(false);
  const [autoStartRequested, setAutoStartRequested] = useState(false);
  const [intake, setIntake] = useState({ active: false, processed: 0, total: 0 });

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
    const saved = queue.filter((item) => item.status === 'done').length;
    const skipped = queue.filter((item) => item.status === 'skipped').length;
    const failed = queue.filter((item) => item.status === 'error').length;
    const uploadingCount = queue.filter((item) => item.status === 'uploading').length;
    const waiting = queue.filter((item) => item.status === 'queued' && item.checked).length;
    const uploadableBytes = queue.filter((item) => item.checked && ['queued', 'error'].includes(item.status)).reduce((sum, item) => sum + item.size, 0);
    const finished = saved + skipped + failed;
    return { total, saved, skipped, failed, uploadingCount, waiting, uploadableBytes, finished, percent: total ? Math.round((finished / total) * 100) : 0 };
  }, [queue]);

  useEffect(() => {
    if (!autoStartRequested || uploading || !stats.waiting || intake.active) return;
    setAutoStartRequested(false);
    const timer = window.setTimeout(() => startBackup(), 500);
    return () => window.clearTimeout(timer);
  }, [autoStartRequested, uploading, stats.waiting, intake.active]);

  async function addFileList(fileList) {
    const totalSelected = Number(fileList?.length || 0);
    if (!totalSelected) return;

    const smartSelection = totalSelected > SMART_BATCH_THRESHOLD || queue.length + totalSelected > SMART_BATCH_THRESHOLD;
    const existingKeys = new Set(queue.map((item) => item.key || `${item.name}:${item.size}:${item.lastModified || 0}`));
    let acceptedCount = 0;
    let previewsCreated = 0;

    setSummary(null);
    setIntake({ active: true, processed: 0, total: totalSelected });
    if (smartSelection) setLargeMode(true);

    for (let start = 0; start < totalSelected; start += FILELIST_INTAKE_CHUNK) {
      const accepted = [];
      const nextPreviews = {};
      const end = Math.min(totalSelected, start + FILELIST_INTAKE_CHUNK);

      for (let index = start; index < end; index += 1) {
        const file = fileList.item ? fileList.item(index) : fileList[index];
        if (!file || !isMediaFile(file)) continue;
        const key = fileKey(file);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        const id = makeId();
        const mayPreview = file.type?.startsWith('image/') || PHOTO_EXTENSION.test(file.name || '');
        if (mayPreview && (!smartSelection || previewsCreated < LARGE_PREVIEW_LIMIT)) {
          try {
            nextPreviews[id] = URL.createObjectURL(file);
            previewsCreated += 1;
          } catch {}
        }

        accepted.push({
          id,
          key,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          checked: true,
          status: 'queued',
          progress: 0,
          reason: null,
          message: null,
          retryable: true,
        });
      }

      if (accepted.length) {
        acceptedCount += accepted.length;
        setQueue((previous) => [...previous, ...accepted]);
        if (Object.keys(nextPreviews).length) setPreviews((previous) => ({ ...previous, ...nextPreviews }));
      }

      setIntake({ active: true, processed: end, total: totalSelected });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    setIntake({ active: false, processed: totalSelected, total: totalSelected });

    if (!acceptedCount) {
      toast.error('No new photos or videos selected.');
      return;
    }

    if (smartSelection) {
      setAutoStartRequested(true);
      toast.success(`${acceptedCount} memories ready · backup starting`);
    } else {
      toast.success(`Added ${acceptedCount} files`);
    }
  }

  function onSelect(event) {
    const input = event.currentTarget;
    const fileList = input.files;
    if (fileList?.length) {
      addFileList(fileList).finally(() => {
        window.setTimeout(() => {
          try { input.value = ''; } catch {}
        }, 350);
      });
    } else {
      window.setTimeout(() => {
        try { input.value = ''; } catch {}
      }, 350);
    }
  }

  function updateItem(id, patch) {
    setQueue((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function releaseItemFile(id) {
    setQueue((previous) => previous.map((item) => item.id === id ? { ...item, file: null } : item));
    if (previews[id]) {
      try { URL.revokeObjectURL(previews[id]); } catch {}
      setPreviews((previous) => {
        const copy = { ...previous };
        delete copy[id];
        return copy;
      });
    }
  }

  function removeItem(id) {
    setQueue((previous) => previous.filter((item) => item.id !== id));
    if (previews[id]) {
      try { URL.revokeObjectURL(previews[id]); } catch {}
      setPreviews((previous) => {
        const copy = { ...previous };
        delete copy[id];
        return copy;
      });
    }
  }

  function clearDone() {
    setQueue((previous) => previous.filter((item) => !['done', 'skipped'].includes(item.status)));
  }

  async function uploadOne(item) {
    if (!item.file) return 'failed';
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
      const saved = new Set((data.saved || []).map((media) => media.name));
      const skipped = (data.skipped || []).find((media) => media.name === item.name);

      if (saved.has(item.name)) {
        updateItem(item.id, { status: 'done', progress: 100 });
        releaseItemFile(item.id);
        return 'saved';
      }

      if (skipped) {
        const reason = skipped.reason || 'storage_unavailable';
        const finalStatus = reason === 'duplicate' ? 'skipped' : 'error';
        updateItem(item.id, { status: finalStatus, progress: 100, reason, message: skipped.message, retryable: skipped.retryable !== false });
        if (finalStatus === 'skipped' || skipped.retryable === false) releaseItemFile(item.id);
        return finalStatus === 'skipped' ? 'skipped' : 'failed';
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
    const items = queue.filter((item) => item.checked && item.file && ['queued', 'error'].includes(item.status));
    if (!items.length) return toast.error('Choose files to back up first.');

    setUploading(true);
    setSummary(null);
    const counts = { saved: 0, skipped: 0, failed: 0, total: items.length };
    let cursor = 0;
    const laneCount = largeMode ? 2 : 1;

    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        const outcome = await uploadOne(item);
        if (outcome === 'saved') counts.saved += 1;
        else if (outcome === 'skipped') counts.skipped += 1;
        else counts.failed += 1;
      }
    }

    await Promise.all(Array.from({ length: laneCount }, () => worker()));
    setUploading(false);
    setSummary(counts);
    apiFetch('/storage/usage').then(setUsage).catch(() => {});
    toast.success(`Backup complete: ${counts.saved} saved · ${counts.skipped + counts.failed} skipped/failed`);
  }

  const visibleQueue = useMemo(() => {
    if (!largeMode || queue.length <= LARGE_QUEUE_VISIBLE) return queue;
    const active = queue.filter((item) => item.status === 'uploading');
    const waiting = queue.filter((item) => item.status === 'queued').slice(0, 5);
    const issues = queue.filter((item) => item.status === 'error').slice(0, 3);
    const recentDone = queue.filter((item) => ['done', 'skipped'].includes(item.status)).slice(-4).reverse();
    const seen = new Set();
    return [...active, ...waiting, ...issues, ...recentDone].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, LARGE_QUEUE_VISIBLE);
  }, [largeMode, queue]);

  const planName = usage?.plan?.name || usage?.planName || 'Current plan';
  const used = usage?.usage?.bytes || 0;
  const total = usage?.plan?.storageBytes || 0;
  const isSuper = !!usage?.isSuper;
  const usedPct = total && !isSuper ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const reasonCounts = queue.reduce((counts, item) => {
    if (item.reason) counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});
  const pickerDisabled = uploading || intake.active;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-36 md:pb-12">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-600/10 to-cyan-500/10 p-5 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-100/70">Safe backup</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">Back up photos and videos</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">Choose your memories in web-safe rounds. On mobile web, pick about 10–20 at a time, tap Add or Done, and SnapNext uploads them right away.</p>
          </div>
          <NativeMediaPicker disabled={pickerDisabled} onSelect={onSelect} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-6 py-3 text-sm font-black text-white shadow-xl shadow-pink-950/30">
            {intake.active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {intake.active ? 'Preparing…' : 'Choose memories'}
          </NativeMediaPicker>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/55"><b className="text-white/80">Best on web:</b> choose {WEB_SAFE_BATCH_MAX} or fewer photos/videos per round. Very large selections may stay inside the iPhone picker before SnapNext can receive them.</div>
      </section>

      {intake.active && (
        <section className="rounded-[2rem] border border-cyan-300/20 bg-cyan-400/10 p-5 text-sm text-cyan-100">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Preparing selected memories {intake.processed} of {intake.total}. Keep SnapNext open.
        </section>
      )}

      {largeMode && stats.total > 0 && (
        <section className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 p-5 md:p-7">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-cyan-200"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/65">Web-safe backup round</p>
              <h2 className="mt-1 text-2xl font-black text-white">{uploading ? `Backing up ${stats.total} memories` : stats.finished === stats.total ? 'This round is complete' : `${stats.total} memories ready`}</h2>
              <p className="mt-2 text-sm text-white/50">{stats.saved} saved · {stats.uploadingCount} moving now · {stats.waiting} remaining · {stats.failed} need attention</p>
            </div>
            <span className="text-2xl font-black text-white">{stats.percent}%</span>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-pink-400 to-purple-500 transition-all duration-500" style={{ width: `${stats.percent}%` }} /></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/40"><span>After this round, tap Add next batch and choose another 10–20.</span><span>{uploading ? 'Keep this tab open' : 'Ready for next round'}</span></div>
        </section>
      )}

      {!largeMode && (
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div><h2 className="text-xl font-black text-white">{uploading ? 'Backing up now' : stats.total ? 'Ready to back up' : 'All caught up'}</h2><p className="mt-1 text-sm text-white/50">{stats.saved} saved · {stats.skipped} skipped · {stats.failed} failed · {stats.waiting} waiting</p></div>
            <button onClick={startBackup} disabled={uploading || intake.active || !stats.waiting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-40">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />} {uploading ? 'Saving…' : 'Start backup'}</button>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-pink-500 to-purple-600 transition-all" style={{ width: `${stats.percent}%` }} /></div>
        </section>
      )}

      {summary && <section className="rounded-[2rem] border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm text-emerald-100"><CheckCircle2 className="mr-2 inline h-4 w-4" /> Backup complete: {summary.saved} saved, {summary.skipped + summary.failed} not saved.</section>}

      {(summary || (largeMode && !uploading && stats.finished === stats.total && stats.total > 0)) && (
        <NativeMediaPicker disabled={pickerDisabled} onSelect={onSelect} className="flex min-h-14 items-center justify-center gap-2 rounded-[1.5rem] border border-white/10 bg-white px-5 py-4 text-sm font-black text-black shadow-xl">
          <Upload className="h-4 w-4" /> Add next batch
        </NativeMediaPicker>
      )}

      {!!Object.keys(reasonCounts).length && (
        <section className="rounded-[2rem] border border-amber-400/20 bg-amber-400/10 p-5"><h2 className="text-lg font-black text-white">Why some files were skipped</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(reasonCounts).map(([reason, count]) => <div key={reason} className="rounded-2xl bg-black/20 p-3 text-sm text-white/70"><AlertCircle className="mr-2 inline h-4 w-4 text-amber-200" />{REASON_COPY[reason] || reason}: <b>{count}</b></div>)}</div><p className="mt-3 text-xs text-white/45">Your original local files are never deleted by SnapNext.</p></section>
      )}

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Storage</p><h2 className="mt-2 text-xl font-black text-white">{isSuper ? 'Unlimited storage' : `${formatBytes(used)} of ${formatBytes(total)} used`}</h2><p className="mt-1 text-sm text-white/45">{planName}</p></div>{!isSuper && <Link href="/billing" className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white">Get more space</Link>}</div>
        {!isSuper && <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" style={{ width: `${usedPct}%` }} /></div>}
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-200" /><div><h2 className="text-lg font-black text-white">Web-safe backup</h2><p className="mt-1 text-sm text-white/50">For very large libraries, use multiple web rounds today. Native iOS and Android apps will support deeper library access and background backup later.</p></div></div></section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-white">{largeMode ? 'Live backup activity' : 'Current queue'}</h2><p className="mt-1 text-sm text-white/45">{stats.total} files · {formatBytes(stats.uploadableBytes)} remaining to upload</p></div><div className="flex gap-2">{!largeMode && <button onClick={() => setQueue((previous) => previous.map((item) => ['queued', 'error'].includes(item.status) ? { ...item, checked: true } : item))} disabled={uploading || intake.active} className="rounded-full bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/70">Select all</button>}<button onClick={clearDone} disabled={uploading || intake.active} className="rounded-full bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/70">Clear saved</button></div></div>
        <div className="mt-4 grid gap-3">
          {queue.length === 0 ? (
            <NativeMediaPicker disabled={pickerDisabled} onSelect={onSelect} className="grid min-h-48 place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center"><div><FileImage className="mx-auto h-8 w-8 text-pink-200" /><p className="mt-3 font-bold text-white">Choose photos and videos</p><p className="mt-1 text-sm text-white/45">Select up to {WEB_SAFE_BATCH_MAX}, tap Add or Done, then repeat. SnapNext starts larger rounds automatically.</p></div></NativeMediaPicker>
          ) : visibleQueue.map((item) => {
            const status = itemStatus(item);
            const Icon = status.icon;
            return (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3">
                {!largeMode && <input type="checkbox" checked={item.checked} disabled={uploading || !['queued', 'error'].includes(item.status)} onChange={(event) => updateItem(item.id, { checked: event.target.checked })} className="h-5 w-5 rounded" />}
                {previews[item.id] ? <img src={previews[item.id]} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-white/[0.05]"><ImageIcon className="h-5 w-5 text-white/35" /></div>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{item.name}</p><p className="mt-1 text-xs text-white/42">{formatBytes(item.size)} · {REASON_COPY[item.reason] || item.message || ''}</p>{item.status === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${item.progress}%` }} /></div>}</div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}><Icon className={`h-3.5 w-3.5 ${item.status === 'uploading' ? 'animate-spin' : ''}`} />{status.label}</span>
                {!largeMode && <button onClick={() => removeItem(item.id)} disabled={uploading} className="rounded-full p-2 text-white/40 hover:bg-white/5"><XCircle className="h-4 w-4" /></button>}
              </div>
            );
          })}
          {largeMode && queue.length > visibleQueue.length && <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-center text-sm text-white/45">{queue.length - visibleQueue.length} more memories continue safely in this round.</div>}
        </div>
      </section>
    </div>
  );
}
