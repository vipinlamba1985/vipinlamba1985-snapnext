'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  Crop,
  Download,
  FlipHorizontal,
  FlipVertical,
  Loader2,
  Redo2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from 'lucide-react';

const DEFAULTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  warmth: 0,
  highlights: 0,
  shadows: 0,
  clarity: 0,
  rotation: 0,
  straighten: 0,
  flipX: 1,
  flipY: 1,
  aspect: 'original',
};

const PRESETS = {
  natural: { brightness: 105, contrast: 107, saturate: 108, warmth: 2, highlights: -2, shadows: 5, clarity: 5 },
  archive: { brightness: 108, contrast: 113, saturate: 110, warmth: 8, highlights: -6, shadows: 8, clarity: 8 },
  lowlight: { brightness: 118, contrast: 104, saturate: 106, warmth: 3, highlights: -12, shadows: 18, clarity: 4 },
  portrait: { brightness: 108, contrast: 103, saturate: 105, warmth: 6, highlights: -6, shadows: 9, clarity: 2 },
  travel: { brightness: 104, contrast: 112, saturate: 124, warmth: 5, highlights: -7, shadows: 5, clarity: 10 },
  baby: { brightness: 109, contrast: 98, saturate: 103, warmth: 8, highlights: -8, shadows: 10, clarity: -2 },
  document: { brightness: 111, contrast: 128, saturate: 35, warmth: 0, highlights: 5, shadows: -5, clarity: 15 },
  golden: { brightness: 105, contrast: 106, saturate: 112, warmth: 16, highlights: -5, shadows: 7, clarity: 4 },
};

const AI_ACTIONS = [
  { id: 'hd-upscale', name: 'AI HD Restore', detail: 'Recover missing detail with advanced restoration.', credits: 12 },
  { id: 'low-light', name: 'Advanced Low-Light Repair', detail: 'Improve very dark photos while protecting faces.', credits: 10 },
  { id: 'denoise', name: 'Advanced Denoise', detail: 'Reduce heavy grain and recover clarity.', credits: 10 },
  { id: 'portrait', name: 'Gentle Portrait Recovery', detail: 'Improve a damaged portrait without changing identity.', credits: 12 },
  { id: 'restore', name: 'Severe Damage Repair', detail: 'Repair fading, scratches and lost contrast.', credits: 20 },
];

const ASPECTS = [
  ['original', 'Original'],
  ['1:1', 'Square'],
  ['4:3', 'Classic'],
  ['3:2', 'Photo'],
  ['16:9', 'Wide'],
];

function mergeEdit(current, partial) {
  return { ...current, ...partial };
}

function ratioFor(aspect, width, height) {
  if (aspect === 'original') return width / height;
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
}

function buildFilter(adjust) {
  const shadowLift = adjust.shadows * 0.18;
  const highlightProtect = adjust.highlights * 0.08;
  const brightness = Math.max(40, adjust.brightness + shadowLift + highlightProtect);
  const contrast = Math.max(40, adjust.contrast + adjust.clarity * 0.35);
  const sepia = Math.max(0, adjust.warmth) / 250;
  const hue = adjust.warmth < 0 ? adjust.warmth / 5 : 0;
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${adjust.saturate}%) sepia(${sepia}) hue-rotate(${hue}deg)`;
}

function friendlyAnalysis(stats) {
  if (!stats) return null;
  if (stats.brightness < 72) return { preset: 'lowlight', title: 'This photo looks a little dark', reason: 'We can gently lift the shadows while keeping bright areas natural.' };
  if (stats.contrast < 34 && stats.saturation < 38) return { preset: 'archive', title: 'This photo looks softly faded', reason: 'Family Archive can restore contrast and color without making it look artificial.' };
  if (stats.saturation < 32) return { preset: 'natural', title: 'The colors look a little quiet', reason: 'Natural Auto can bring them back gently.' };
  if (stats.brightness > 188) return { preset: 'natural', title: 'Some bright areas may be losing detail', reason: 'Natural Auto can soften highlights and rebalance the photo.' };
  if (stats.edgeDensity < 8) return { preset: 'archive', title: 'The photo looks a little soft', reason: 'A careful contrast and detail boost may help.' };
  return { preset: 'natural', title: 'This photo is already in good shape', reason: 'A light Natural Auto polish can make it feel a little richer.' };
}

export default function EnhancePhotoPage() {
  const [photos, setPhotos] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [adjust, setAdjust] = useState(DEFAULTS);
  const [history, setHistory] = useState([DEFAULTS]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [providerReady, setProviderReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const imageRef = useRef(null);

  useEffect(() => {
    Promise.all([apiFetch('/media?filter=photo'), apiFetch('/ai-enhance-photo')])
      .then(([media, setup]) => {
        setPhotos((media.items || []).slice(0, 60));
        setProviderReady(Boolean(setup.providerReady));
      })
      .catch((error) => toast.error(error.message || 'We could not open Enhance Photo.'));
  }, []);

  const filter = useMemo(() => buildFilter(adjust), [adjust]);
  const transform = useMemo(
    () => `rotate(${adjust.rotation + adjust.straighten}deg) scaleX(${adjust.flipX}) scaleY(${adjust.flipY})`,
    [adjust],
  );

  function commit(next) {
    const clean = { ...DEFAULTS, ...next };
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(clean);
    setHistory(nextHistory.slice(-30));
    setHistoryIndex(Math.min(nextHistory.length - 1, 29));
    setAdjust(clean);
    setResult(null);
  }

  function setValue(key, value, record = false) {
    const next = { ...adjust, [key]: value };
    setAdjust(next);
    setResult(null);
    if (record) commit(next);
  }

  function reset() {
    setAdjust(DEFAULTS);
    setHistory([DEFAULTS]);
    setHistoryIndex(0);
    setResult(null);
    setAnalysis(null);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setAdjust(history[nextIndex]);
    setResult(null);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setAdjust(history[nextIndex]);
    setResult(null);
  }

  function applyPreset(name) {
    commit(mergeEdit(DEFAULTS, PRESETS[name]));
    toast.success('A gentle new look has been applied.');
  }

  async function analyzePhoto() {
    if (!selectedId || !imageRef.current) return toast.error('Choose a photo first.');
    setAnalyzing(true);
    try {
      const img = imageRef.current;
      const canvas = document.createElement('canvas');
      const max = 180;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let light = 0;
      let lightSq = 0;
      let saturation = 0;
      let edges = 0;
      let previous = 0;
      const pixels = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        light += lum;
        lightSq += lum * lum;
        saturation += Math.max(r, g, b) - Math.min(r, g, b);
        if (i > 4 && Math.abs(lum - previous) > 28) edges += 1;
        previous = lum;
      }
      const mean = light / pixels;
      const variance = Math.max(0, lightSq / pixels - mean * mean);
      const stats = {
        brightness: mean,
        contrast: Math.sqrt(variance),
        saturation: saturation / pixels,
        edgeDensity: (edges / pixels) * 100,
      };
      setAnalysis(friendlyAnalysis(stats));
    } catch {
      toast.error('We could not study this photo. You can still edit it normally.');
    } finally {
      setAnalyzing(false);
    }
  }

  function smartEnhance() {
    if (!analysis) return analyzePhoto();
    applyPreset(analysis.preset);
  }

  async function downloadManual(quality = 0.94) {
    if (!selectedId || !imageRef.current) return toast.error('Choose a photo first.');
    const img = imageRef.current;
    const rotation = ((adjust.rotation % 360) + 360) % 360;
    const swap = rotation === 90 || rotation === 270;
    const sourceW = img.naturalWidth;
    const sourceH = img.naturalHeight;
    const desiredRatio = ratioFor(adjust.aspect, sourceW, sourceH);
    let cropW = sourceW;
    let cropH = sourceH;
    if (sourceW / sourceH > desiredRatio) cropW = sourceH * desiredRatio;
    else cropH = sourceW / desiredRatio;
    const sx = (sourceW - cropW) / 2;
    const sy = (sourceH - cropH) / 2;
    const outW = Math.round(swap ? cropH : cropW);
    const outH = Math.round(swap ? cropW : cropH);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(((adjust.rotation + adjust.straighten) * Math.PI) / 180);
    ctx.scale(adjust.flipX, adjust.flipY);
    ctx.filter = filter;
    ctx.drawImage(img, sx, sy, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);
    ctx.restore();
    const link = document.createElement('a');
    link.download = `snapnext-enhanced-${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', quality);
    link.click();
    toast.success('Your enhanced copy is ready. The original stayed unchanged.');
  }

  async function runAi(action) {
    if (!selectedId) return toast.error('Choose a photo first.');
    setBusy(action.id);
    setResult(null);
    try {
      const response = await apiFetch('/ai-enhance-photo', {
        method: 'POST',
        body: JSON.stringify({ mediaId: selectedId, action: action.id }),
      });
      setResult(response.job);
      toast.success('Your restored copy is ready.');
    } catch (error) {
      toast.error(error.message || 'We could not finish this one. Your Credits were not used.');
    } finally {
      setBusy('');
    }
  }

  const previewUrl = result?.outputUrl || (selectedId ? mediaSrc(selectedId) : '');

  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Enhance Photo</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Make a photo brighter, richer and easier to enjoy. Free edits stay on your device, and your original always remains safe.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${providerReady ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/5 text-white/55'}`}>{providerReady ? 'Advanced restoration available' : 'Free editor ready'}</span>
      </header>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <h2 className="font-black">Choose a photo</h2>
        {photos.length ? (
          <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
            {photos.map((photo) => (
              <button key={photo.id} onClick={() => { setSelectedId(photo.id); reset(); }} className={`aspect-square overflow-hidden rounded-xl border-2 ${selectedId === photo.id ? 'border-cyan-400' : 'border-transparent'}`}>
                <img src={mediaSrc(photo.id)} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-white/50">Upload a photo first.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <section className="rounded-[2rem] border border-white/10 bg-black/20 p-4">
          <div className="relative grid min-h-[440px] place-items-center overflow-hidden rounded-3xl bg-black/40">
            {previewUrl ? (
              <img
                ref={imageRef}
                crossOrigin="anonymous"
                src={previewUrl}
                alt="Enhancement preview"
                style={{
                  filter: result || showOriginal ? 'none' : filter,
                  transform: result || showOriginal ? 'none' : transform,
                  transition: 'filter 180ms ease, transform 180ms ease',
                }}
                className="max-h-[72vh] w-full object-contain"
              />
            ) : <p className="text-sm text-white/35">Choose a photo to begin.</p>}
            {previewUrl && !result && (
              <button onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)} className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-bold backdrop-blur">
                <ArrowLeftRight className="h-4 w-4" /> Hold to see before
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => downloadManual(0.94)} disabled={!selectedId || Boolean(result)} className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2 text-sm font-black text-black disabled:opacity-40"><Download className="h-4 w-4" /> Save high quality</button>
            <button onClick={() => downloadManual(0.82)} disabled={!selectedId || Boolean(result)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold disabled:opacity-40"><Download className="h-4 w-4" /> Share-ready copy</button>
            {result?.outputUrl && <a href={result.outputUrl} download className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-black text-black"><Download className="h-4 w-4" /> Save restored copy</a>}
            <button onClick={undo} disabled={historyIndex <= 0} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 disabled:opacity-30" title="Undo"><Undo2 className="h-4 w-4" /></button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 disabled:opacity-30" title="Redo"><Redo2 className="h-4 w-4" /></button>
            <button onClick={reset} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold"><RotateCcw className="h-4 w-4" /> Start over</button>
          </div>
          <p className="mt-3 text-xs text-white/40">Saving creates a new copy. SnapNext never overwrites your original photo.</p>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-5">
            <div className="flex items-center gap-2 font-black"><Sparkles className="h-4 w-4 text-cyan-300" /> Smart Enhance · Free</div>
            <p className="mt-2 text-xs leading-5 text-white/55">SnapNext studies the light, color and detail on your device, then suggests a natural improvement.</p>
            {analysis && (
              <div className="mt-4 rounded-2xl bg-black/20 p-4">
                <p className="text-sm font-black">{analysis.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/50">{analysis.reason}</p>
              </div>
            )}
            <button onClick={smartEnhance} disabled={!selectedId || analyzing} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-black text-black disabled:opacity-40">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {analysis ? 'Apply Smart Enhance' : 'Study this photo'}
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="font-black">Quick looks · Free</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ['natural', 'Natural Auto'], ['archive', 'Family Archive'], ['lowlight', 'Low-Light Rescue'], ['portrait', 'Portrait Glow'],
                ['travel', 'Travel Pop'], ['baby', 'Baby Soft'], ['document', 'Document Cleanup'], ['golden', 'Golden Memory'],
              ].map(([id, label]) => <button key={id} onClick={() => applyPreset(id)} disabled={!selectedId} className="rounded-2xl bg-white/5 px-3 py-3 text-sm font-bold hover:bg-white/10 disabled:opacity-35">{label}</button>)}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 font-black"><Crop className="h-4 w-4" /> Crop and position · Free</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {ASPECTS.map(([id, label]) => <button key={id} onClick={() => commit({ ...adjust, aspect: id })} className={`rounded-xl px-2 py-2 text-xs font-bold ${adjust.aspect === id ? 'bg-cyan-500 text-black' : 'bg-white/5'}`}>{label}</button>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => commit({ ...adjust, rotation: (adjust.rotation - 90) % 360 })} className="grid h-10 w-10 place-items-center rounded-full bg-white/5" title="Rotate left"><RotateCcw className="h-4 w-4" /></button>
              <button onClick={() => commit({ ...adjust, rotation: (adjust.rotation + 90) % 360 })} className="grid h-10 w-10 place-items-center rounded-full bg-white/5" title="Rotate right"><RotateCw className="h-4 w-4" /></button>
              <button onClick={() => commit({ ...adjust, flipX: adjust.flipX * -1 })} className="grid h-10 w-10 place-items-center rounded-full bg-white/5" title="Flip horizontally"><FlipHorizontal className="h-4 w-4" /></button>
              <button onClick={() => commit({ ...adjust, flipY: adjust.flipY * -1 })} className="grid h-10 w-10 place-items-center rounded-full bg-white/5" title="Flip vertically"><FlipVertical className="h-4 w-4" /></button>
            </div>
            <label className="mt-4 block text-xs text-white/60"><span className="flex justify-between"><b>Straighten</b><span>{adjust.straighten}°</span></span><input type="range" min="-10" max="10" step="0.5" value={adjust.straighten} onChange={(event) => setValue('straighten', Number(event.target.value))} onPointerUp={() => commit(adjust)} className="mt-2 w-full" /></label>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 font-black"><SlidersHorizontal className="h-4 w-4" /> Fine tune · Free</div>
            <div className="mt-4 space-y-4">
              {[
                ['brightness', 'Brightness', 60, 140], ['contrast', 'Contrast', 60, 140], ['saturate', 'Color', 50, 160], ['warmth', 'Warmth', -30, 30],
                ['highlights', 'Highlights', -30, 30], ['shadows', 'Shadows', -30, 30], ['clarity', 'Details', -20, 30],
              ].map(([key, label, min, max]) => (
                <label key={key} className="block text-xs text-white/60">
                  <span className="flex justify-between"><b>{label}</b><span>{adjust[key]}</span></span>
                  <input type="range" min={min} max={max} value={adjust[key]} onChange={(event) => setValue(key, Number(event.target.value))} onPointerUp={() => commit(adjust)} className="mt-2 w-full" />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-5">
            <h2 className="font-black">Advanced restoration</h2>
            <p className="mt-1 text-xs leading-5 text-white/45">Use this only when the free editor cannot repair serious damage. Credits are used only after a result is ready.</p>
            <div className="mt-3 space-y-2">
              {AI_ACTIONS.map((action) => (
                <button key={action.id} onClick={() => runAi(action)} disabled={Boolean(busy) || !selectedId || !providerReady} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 text-left disabled:opacity-40">
                  <span><b className="text-sm">{action.name}</b><span className="mt-1 block text-xs text-white/45">{action.detail}</span></span>
                  <span className="whitespace-nowrap text-xs font-bold text-cyan-200">{busy === action.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Uses ${action.credits}`}</span>
                </button>
              ))}
            </div>
            {!providerReady && <p className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-white/55">Advanced restoration is coming later. Every free editing tool above is ready now.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
