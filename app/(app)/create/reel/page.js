'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Film,
  Loader2,
  Music2,
  Play,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';

const CREATE_REEL_HANDOFF_KEY = 'snapnext:create-reel-handoff:v1';
const MAX_SCENES = 20;

function safeHandoff() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(CREATE_REEL_HANDOFF_KEY) || 'null');
    if (!parsed || parsed.version !== 1 || Number(parsed.expiresAt || 0) <= Date.now()) {
      window.sessionStorage.removeItem(CREATE_REEL_HANDOFF_KEY);
      return null;
    }
    const media = (Array.isArray(parsed.media) ? parsed.media : [])
      .filter((item) => item?.id && ['photo', 'video'].includes(item?.kind))
      .slice(0, MAX_SCENES);
    return {
      query: String(parsed.query || '').slice(0, 1200),
      media,
      mediaIds: media.map((item) => String(item.id)),
      source: parsed.source || null,
    };
  } catch {
    return null;
  }
}

function formatDuration(milliseconds = 0) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function mergeMedia(primary = [], secondary = []) {
  const byId = new Map();
  for (const item of [...primary, ...secondary]) {
    const id = String(item?.id || '');
    if (!id || byId.has(id)) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
}

export default function CreateReelPage() {
  const [library, setLibrary] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [handoff, setHandoff] = useState(null);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [includeMusic, setIncludeMusic] = useState(true);
  const [preparation, setPreparation] = useState(null);
  const [renderState, setRenderState] = useState(null);
  const [busy, setBusy] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    const localHandoff = safeHandoff();
    if (localHandoff) {
      setHandoff(localHandoff);
      setSelectedIds(localHandoff.mediaIds);
    }
    apiFetch('/media?view=gallery&filter=all&limit=60')
      .then((data) => {
        if (cancelled) return;
        setLibrary(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Your recent library could not load. The memories handed over by Ask SnapNext can still be reviewed.');
      })
      .finally(() => { if (!cancelled) setBusy(''); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const jobId = renderState?.job?.id;
    if (!jobId || renderState?.downloadUrl || ['failed', 'ready'].includes(renderState?.job?.status)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await apiFetch(`/create/reels/render/${encodeURIComponent(jobId)}`);
        if (!cancelled) setRenderState(next);
      } catch {}
    };
    const timer = window.setInterval(poll, 2500);
    poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [renderState?.downloadUrl, renderState?.job?.id, renderState?.job?.status]);

  const allMedia = useMemo(() => mergeMedia(handoff?.media || [], library), [handoff?.media, library]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedMedia = useMemo(() => {
    const byId = new Map(allMedia.map((item) => [String(item.id), item]));
    return selectedIds.map((id) => byId.get(String(id)) || { id, kind: 'photo', name: 'Selected memory' });
  }, [allMedia, selectedIds]);

  function resetPrepared() {
    setPreparation(null);
    setRenderState(null);
  }

  function toggleMedia(id) {
    const value = String(id || '');
    if (!value) return;
    setSelectedIds((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (current.length >= MAX_SCENES) {
        toast.error(`A Reel can use up to ${MAX_SCENES} memories.`);
        return current;
      }
      return [...current, value];
    });
    resetPrepared();
  }

  async function prepareReel() {
    if (!selectedIds.length) return toast.error('Choose at least one memory.');
    setBusy('prepare');
    try {
      const result = await apiFetch('/create/reels/prepare', {
        method: 'POST',
        body: JSON.stringify({ mediaIds: selectedIds, aspectRatio, includeMusic }),
      });
      setPreparation(result);
      setRenderState(null);
      toast.success('Reel preview verified.');
    } catch (error) {
      toast.error(error.message || 'This Reel could not be prepared.');
    } finally {
      setBusy('');
    }
  }

  async function renderReel() {
    if (!preparation?.manifest) return;
    setBusy('render');
    try {
      const result = await apiFetch('/create/reels/render', {
        method: 'POST',
        body: JSON.stringify({ manifest: preparation.manifest }),
      });
      setRenderState(result);
      if (result.downloadUrl) toast.success('Your Reel is ready.');
      else toast.success('Reel render started.');
    } catch (error) {
      toast.error(error.message || 'Reel render could not start.');
    } finally {
      setBusy('');
    }
  }

  async function shareReadyReel() {
    const url = renderState?.downloadUrl;
    if (!url) return;
    if (!navigator.share || typeof File === 'undefined') return toast('Use Download to save the MP4, then share it from your device.');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('download_failed');
      const blob = await response.blob();
      const file = new File([blob], 'snapnext-reel.mp4', { type: 'video/mp4' });
      if (!navigator.canShare?.({ files: [file] })) return toast('Use Download to save the MP4, then share it from your device.');
      await navigator.share({ files: [file], title: 'SnapNext Reel' });
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error('Direct share is unavailable here. Use Download instead.');
    }
  }

  const preview = preparation?.preview;
  const quotaBlocked = preview && !preview.quota?.allowed;
  const rendererBlocked = preview && !preview.rendererReady;
  const renderReady = Boolean(renderState?.downloadUrl);

  return (
    <div data-testid="create-reel-page" className="mx-auto max-w-6xl space-y-6 pb-32 md:pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/ai-studio" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 text-sm font-bold text-white/60"><ArrowLeft className="h-4 w-4" />Create</Link>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-pink-300/15 bg-pink-500/10 px-3 py-1.5 text-xs font-black text-pink-100"><Film className="h-3.5 w-3.5" />Memory Reel</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Turn your memories into a Reel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50 md:text-base">Choose the exact memories, preview the canonical edit, then approve rendering. Previewing does not spend AI Credits or reserve a Reel allowance.</p>
        </div>
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3 text-xs text-emerald-100"><div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" />Originals stay untouched</div><div className="mt-1 text-emerald-100/60">Only the final derived MP4 is rendered.</div></div>
      </header>

      {handoff?.mediaIds?.length > 0 && <section data-testid="create-reel-ask-handoff" className="rounded-3xl border border-cyan-300/15 bg-cyan-400/[0.05] p-4 md:p-5"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><h2 className="font-black">Brought over from Ask SnapNext</h2><p className="mt-1 text-sm leading-5 text-white/50">{handoff.query || 'Your grounded memory matches are preselected below.'}</p><p className="mt-2 text-xs text-white/35">The handoff exists only in this browser tab. The server re-verifies ownership and source hashes before export.</p></div></div></section>}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Selected memories</h2><p className="mt-1 text-xs text-white/40">{selectedIds.length} of {MAX_SCENES} selected</p></div>{selectedIds.length > 0 && <button onClick={() => { setSelectedIds([]); resetPrepared(); }} className="rounded-full border border-white/8 px-3 py-2 text-xs font-bold text-white/50">Clear</button>}</div>
            {selectedMedia.length ? <div data-testid="create-reel-selected" className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">{selectedMedia.map((item, index) => <div key={item.id} className="relative overflow-hidden rounded-2xl border border-pink-300/20 bg-black/20"><div className="aspect-[4/5] overflow-hidden"><img src={galleryThumbnailSrc(item.id, 360)} alt={item.name || `Memory ${index + 1}`} className="h-full w-full object-cover" /></div><span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black">{index + 1}</span>{item.kind === 'video' && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 p-1.5"><Play className="h-3 w-3 fill-white" /></span>}<button aria-label="Remove memory" onClick={() => toggleMedia(item.id)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70"><X className="h-3.5 w-3.5" /></button></div>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">Choose memories below to start your Reel.</div>}
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Add from Library</h2><p className="mt-1 text-xs text-white/40">Recent photos and videos. Ask SnapNext selections remain available even if they are older.</p></div><Link href="/gallery" className="text-xs font-bold text-pink-200">Open Library</Link></div>
            {busy === 'loading' && !allMedia.length ? <div className="mt-5 flex items-center gap-2 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" />Loading memories…</div> : <div data-testid="create-reel-library" className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-2">{allMedia.slice(0, 60).map((item) => { const selected = selectedSet.has(String(item.id)); return <button key={item.id} onClick={() => toggleMedia(item.id)} className={`relative h-24 w-20 shrink-0 overflow-hidden rounded-2xl border-2 ${selected ? 'border-pink-400' : 'border-transparent'}`}><img src={galleryThumbnailSrc(item.id, 320)} alt={item.name || 'Memory'} className="h-full w-full object-cover" /><span className={`absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full ${selected ? 'bg-pink-500 text-white' : 'bg-black/70 text-white/80'}`}>{selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</span></button>; })}</div>}
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 md:p-5">
            <h2 className="font-black">Reel format</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{['9:16', '4:5', '1:1', '16:9'].map((ratio) => <button data-testid={`create-reel-ratio-${ratio}`} key={ratio} onClick={() => { setAspectRatio(ratio); resetPrepared(); }} className={`rounded-2xl border px-3 py-3 text-sm font-black ${aspectRatio === ratio ? 'border-pink-400/50 bg-pink-500/10 text-pink-100' : 'border-white/8 bg-white/[0.02] text-white/55'}`}>{ratio}</button>)}</div>
            <button data-testid="create-reel-music-toggle" onClick={() => { setIncludeMusic((value) => !value); resetPrepared(); }} className="mt-4 flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-left"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-500/10"><Music2 className="h-4 w-4 text-purple-200" /></span><span><span className="block text-sm font-black">Free soundtrack</span><span className="mt-0.5 block text-xs text-white/40">Chill Beat · CC0 · embedded only when selected</span></span></span><span className={`rounded-full px-3 py-1 text-xs font-black ${includeMusic ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/5 text-white/40'}`}>{includeMusic ? 'On' : 'Off'}</span></button>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
            <h2 className="font-black">Before rendering</h2>
            {!preparation ? <><p className="mt-2 text-sm leading-5 text-white/45">SnapNext will verify every selected source, build the final scene order, check the monthly Reel allowance and confirm the renderer is available.</p><button data-testid="create-reel-preview" onClick={prepareReel} disabled={busy === 'prepare' || !selectedIds.length} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 text-sm font-black disabled:opacity-40">{busy === 'prepare' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Preview Reel</button></> : <div data-testid="create-reel-prepared" className="mt-4 space-y-3 text-sm"><SummaryRow label="Scenes" value={preview?.sceneCount} /><SummaryRow label="Length" value={formatDuration(preview?.durationMs)} /><SummaryRow label="Format" value={preview?.aspectRatio} /><SummaryRow label="Music" value={preview?.soundtrack || 'Off'} /><SummaryRow label="Included renders left" value={preview?.quota?.unlimited ? 'Unlimited' : preview?.quota?.remaining} /><div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.05] p-3 text-xs leading-5 text-emerald-100/70">Preview verified. No AI provider was called and no render allowance was reserved.</div>{quotaBlocked && <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100">Your included Reel allowance for this period is used. <Link href="/billing" className="font-black underline">View plans</Link>.</div>}{rendererBlocked && <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-3 text-xs leading-5 text-cyan-100">The canonical MP4 renderer is still being activated. Your preview is safe and no allowance has been used.</div>}<button data-testid="create-reel-render" onClick={renderReel} disabled={busy === 'render' || quotaBlocked || rendererBlocked} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-black disabled:opacity-35">{busy === 'render' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}Render MP4</button><button onClick={prepareReel} disabled={busy === 'prepare'} className="w-full rounded-2xl border border-white/8 px-4 py-3 text-xs font-black text-white/55">Refresh preview</button></div>}
          </div>

          {renderState && <div data-testid="create-reel-render-state" className="rounded-3xl border border-white/8 bg-white/[0.03] p-5"><h2 className="font-black">Render status</h2><div className="mt-3 space-y-2 text-sm"><SummaryRow label="Job" value={renderState.job?.status || renderState.artifact?.status || 'Preparing'} />{renderState.accountingPending && <p className="text-xs text-white/40">Final usage accounting is being verified.</p>}{renderState.deletionSafetyPending && <p className="text-xs text-white/40">Source deletion safety is being rechecked.</p>}{!renderReady && renderState.job?.status && !['failed', 'ready'].includes(renderState.job.status) && <div className="flex items-center gap-2 rounded-2xl bg-white/5 p-3 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />Rendering continues safely in SnapNext.</div>}{renderReady && <div className="space-y-2 pt-2"><a data-testid="create-reel-download" href={renderState.downloadUrl} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 text-sm font-black"><Download className="h-4 w-4" />Download MP4</a><button data-testid="create-reel-share" onClick={shareReadyReel} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-4 text-sm font-black"><Share2 className="h-4 w-4" />Share file</button><p className="text-[11px] leading-4 text-white/35">{renderState.deletionNotice}</p></div>}</div></div>}
        </aside>
      </section>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-white/45">{label}</span><span className="text-right font-black text-white/80">{value ?? '—'}</span></div>;
}
