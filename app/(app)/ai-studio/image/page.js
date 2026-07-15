'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';

export default function CreateImagePage() {
  const [templates, setTemplates] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [providerReady, setProviderReady] = useState(false);
  const [templateId, setTemplateId] = useState('custom');
  const [mediaId, setMediaId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    Promise.all([apiFetch('/ai-create-image'), apiFetch('/media?filter=photo')])
      .then(([setup, media]) => {
        setTemplates(setup.templates || []);
        setProviderReady(!!setup.providerReady);
        setPhotos((media.items || []).slice(0, 40));
      })
      .catch((error) => toast.error(error.message || 'Could not load Create Image.'));
  }, []);

  const active = templates.find((item) => item.id === templateId);

  async function createImage() {
    if (!prompt.trim()) return toast.error('Describe the image you want to create.');
    setBusy(true);
    setResult(null);
    try {
      const response = await apiFetch('/ai-create-image', {
        method: 'POST',
        body: JSON.stringify({ templateId, mediaId: mediaId || null, prompt, aspectRatio }),
      });
      setResult(response.job);
      toast.success('Your image is ready.');
    } catch (error) {
      toast.error(error.message || 'Image creation is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/ai-studio" className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft className="h-4 w-4"/> Back to AI Studio</Link>
          <h1 className="mt-3 text-3xl font-black">Create Image</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Create a new image from text, or select one of your private SnapNext photos and transform it into a new style.</p>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${providerReady ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-100'}`}>{providerReady ? 'Image engine ready' : 'Image engine activating'}</div>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-500/15 via-purple-500/10 to-pink-500/10 p-5">
        <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-cyan-200"/> Ready-to-use image templates</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((item) => (
            <button key={item.id} onClick={() => setTemplateId(item.id)} className={`rounded-3xl border p-4 text-left transition ${templateId === item.id ? 'border-cyan-300 bg-cyan-500/10' : 'border-white/10 bg-black/15 hover:bg-white/[0.05]'}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-black">{item.name}</span><ImageIcon className="h-4 w-4 text-cyan-200"/></div>
              <p className="mt-2 text-xs leading-5 text-white/55">{item.description}</p>
              <p className="mt-3 text-[11px] font-bold text-white/40">Estimated {item.credits} AI credits</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <div>
            <label className="text-xs font-bold text-white/55">Describe your image</label>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} placeholder="Example: cinematic sunset over Goa, warm travel-poster style, elegant typography space" className="mt-2 min-h-32 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-300/60"/>
          </div>

          <div>
            <label className="text-xs font-bold text-white/55">Aspect ratio</label>
            <div className="mt-2 flex flex-wrap gap-2">{['1:1','4:5','9:16','16:9'].map((ratio) => <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`rounded-full px-4 py-2 text-sm font-bold ${aspectRatio === ratio ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>{ratio}</button>)}</div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3"><label className="text-xs font-bold text-white/55">Optional source photo</label>{mediaId && <button onClick={() => setMediaId('')} className="text-xs text-white/45 hover:text-white">Clear photo</button>}</div>
            {photos.length ? <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">{photos.map((photo) => <button key={photo.id} onClick={() => setMediaId(photo.id)} className={`aspect-square overflow-hidden rounded-2xl border-2 ${mediaId === photo.id ? 'border-cyan-300' : 'border-transparent'}`}><img src={mediaSrc(photo.id)} alt="" className="h-full w-full object-cover"/></button>)}</div> : <p className="mt-3 text-sm text-white/45">You can create from text now, or upload a photo to restyle it.</p>}
          </div>

          <button onClick={createImage} disabled={busy || !prompt.trim()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 px-5 py-3 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wand2 className="h-4 w-4"/>} Create image</button>
          <p className="text-xs leading-5 text-white/40">Estimated cost: {active?.credits || '—'} AI credits. Failed generations are not charged. Nothing is posted or shared automatically.</p>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="font-black">Preview</h2>
          <div className="mt-4 grid min-h-80 place-items-center overflow-hidden rounded-3xl border border-dashed border-white/10 bg-black/20">
            {result?.outputUrl ? <img src={result.outputUrl} alt="AI creation" className="h-full max-h-[32rem] w-full object-contain"/> : mediaId ? <img src={mediaSrc(mediaId)} alt="Selected source" className="h-full max-h-80 w-full object-contain opacity-65"/> : <div className="px-6 text-center text-sm leading-6 text-white/35">Choose a template, describe your idea, and optionally select a source photo.</div>}
          </div>
          {!providerReady && <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80">The complete workspace is available, but final generation remains disabled until the approved production image provider is connected.</div>}
        </section>
      </div>
    </div>
  );
}
