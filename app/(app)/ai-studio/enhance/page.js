'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { Download, Loader2, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';

const DEFAULTS = { brightness: 100, contrast: 100, saturate: 100, warmth: 0, sharpness: 0 };
const AI_ACTIONS = [
  { id: 'hd-upscale', name: 'Make HD', detail: 'Upscale and recover fine detail.', credits: 12 },
  { id: 'low-light', name: 'Low-light Fix', detail: 'Lift dark areas while protecting faces.', credits: 10 },
  { id: 'denoise', name: 'Denoise & Sharpen', detail: 'Reduce grain and improve clarity.', credits: 10 },
  { id: 'portrait', name: 'Portrait Improve', detail: 'Natural portrait cleanup without changing identity.', credits: 12 },
  { id: 'restore', name: 'Restore Old Photo', detail: 'Repair fading, scratches and lost contrast.', credits: 20 },
];

export default function EnhancePhotoPage() {
  const [photos, setPhotos] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [adjust, setAdjust] = useState(DEFAULTS);
  const [providerReady, setProviderReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const imageRef = useRef(null);

  useEffect(() => {
    Promise.all([apiFetch('/media?filter=photo'), apiFetch('/ai-enhance-photo')])
      .then(([media, setup]) => {
        setPhotos((media.items || []).slice(0, 60));
        setProviderReady(Boolean(setup.providerReady));
      })
      .catch((error) => toast.error(error.message || 'Could not load Enhance Photo.'));
  }, []);

  const filter = useMemo(() => {
    const sepia = Math.max(0, adjust.warmth) / 250;
    const hue = adjust.warmth < 0 ? adjust.warmth / 5 : 0;
    return `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturate}%) sepia(${sepia}) hue-rotate(${hue}deg)`;
  }, [adjust]);

  function reset() { setAdjust(DEFAULTS); setResult(null); }

  function quick(name) {
    const presets = {
      auto: { brightness: 106, contrast: 108, saturate: 112, warmth: 4, sharpness: 8 },
      bright: { brightness: 118, contrast: 103, saturate: 105, warmth: 2, sharpness: 3 },
      vibrant: { brightness: 104, contrast: 110, saturate: 132, warmth: 5, sharpness: 7 },
      warm: { brightness: 104, contrast: 104, saturate: 112, warmth: 18, sharpness: 4 },
    };
    setAdjust(presets[name]);
  }

  async function downloadManual() {
    if (!selectedId || !imageRef.current) return toast.error('Choose a photo first.');
    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.filter = filter;
    ctx.drawImage(img, 0, 0);
    const link = document.createElement('a');
    link.download = `snapnext-enhanced-${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.94);
    link.click();
    toast.success('Enhanced copy downloaded. Your original is unchanged.');
  }

  async function runAi(action) {
    if (!selectedId) return toast.error('Choose a photo first.');
    setBusy(action.id); setResult(null);
    try {
      const response = await apiFetch('/ai-enhance-photo', {
        method: 'POST',
        body: JSON.stringify({ mediaId: selectedId, action: action.id }),
      });
      setResult(response.job);
      toast.success('Enhanced copy is ready.');
    } catch (error) {
      toast.error(error.message || 'Enhancement is temporarily unavailable.');
    } finally { setBusy(''); }
  }

  const previewUrl = result?.outputUrl || (selectedId ? mediaSrc(selectedId) : '');

  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-black">Enhance Photo</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Make photos brighter, richer and clearer. Manual adjustments are free and happen in your browser; advanced restoration uses AI credits only after success.</p></div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${providerReady ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-100'}`}>{providerReady ? 'HD engine ready' : 'HD engine activating'}</span>
      </header>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <h2 className="font-black">Choose a photo</h2>
        {photos.length ? <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">{photos.map((p) => <button key={p.id} onClick={() => { setSelectedId(p.id); reset(); }} className={`aspect-square overflow-hidden rounded-xl border-2 ${selectedId === p.id ? 'border-cyan-400' : 'border-transparent'}`}><img src={mediaSrc(p.id)} alt="" className="h-full w-full object-cover"/></button>)}</div> : <p className="mt-4 text-sm text-white/50">Upload a photo first.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
        <section className="rounded-[2rem] border border-white/10 bg-black/20 p-4">
          <div className="relative grid min-h-[420px] place-items-center overflow-hidden rounded-3xl bg-black/40">
            {previewUrl ? <img ref={imageRef} crossOrigin="anonymous" src={previewUrl} alt="Enhancement preview" style={{ filter: result ? 'none' : filter }} className="max-h-[70vh] w-full object-contain"/> : <p className="text-sm text-white/35">Choose a photo to begin.</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={downloadManual} disabled={!selectedId || Boolean(result)} className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2 text-sm font-black text-black disabled:opacity-40"><Download className="h-4 w-4"/> Download manual edit</button>
            {result?.outputUrl && <a href={result.outputUrl} download className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-black text-black"><Download className="h-4 w-4"/> Download AI copy</a>}
            <button onClick={reset} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold"><RotateCcw className="h-4 w-4"/> Reset</button>
          </div>
          <p className="mt-3 text-xs text-white/40">SnapNext never overwrites your original photo.</p>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 font-black"><Sparkles className="h-4 w-4 text-cyan-300"/> Quick Enhance · 0 credits</div>
            <div className="mt-4 grid grid-cols-2 gap-2">{[['auto','Auto Enhance'],['bright','Brighter'],['vibrant','More Vibrant'],['warm','Warm & Attractive']].map(([id,label]) => <button key={id} onClick={() => quick(id)} className="rounded-2xl bg-white/5 px-3 py-3 text-sm font-bold hover:bg-white/10">{label}</button>)}</div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 font-black"><SlidersHorizontal className="h-4 w-4"/> Manual Adjust · 0 credits</div>
            <div className="mt-4 space-y-4">{[
              ['brightness','Brightness',60,140],['contrast','Contrast',60,140],['saturate','Vibrance',50,160],['warmth','Warmth',-30,30]
            ].map(([key,label,min,max]) => <label key={key} className="block text-xs text-white/60"><span className="flex justify-between"><b>{label}</b><span>{adjust[key]}</span></span><input type="range" min={min} max={max} value={adjust[key]} onChange={(e)=>setAdjust({...adjust,[key]:Number(e.target.value)})} className="mt-2 w-full"/></label>)}</div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-5">
            <h2 className="font-black">AI Enhancements</h2>
            <div className="mt-3 space-y-2">{AI_ACTIONS.map((action) => <button key={action.id} onClick={() => runAi(action)} disabled={Boolean(busy) || !selectedId} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 text-left disabled:opacity-40"><span><b className="text-sm">{action.name}</b><span className="mt-1 block text-xs text-white/45">{action.detail}</span></span><span className="whitespace-nowrap text-xs font-bold text-cyan-200">{busy === action.id ? <Loader2 className="h-4 w-4 animate-spin"/> : `${action.credits} credits`}</span></button>)}</div>
            {!providerReady && <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-100/75">Advanced enhancement remains disabled until an approved provider is configured. Manual editing is available now.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
