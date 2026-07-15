'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { ArrowLeft, Film, Image as ImageIcon, Loader2, Sparkles, Wand2 } from 'lucide-react';

const GROUPS = [
  { id: 'avatar', label: 'Avatars' },
  { id: 'motion', label: 'Photo Motion' },
  { id: 'background', label: 'Backgrounds' },
  { id: 'fun', label: 'Funny Faces' },
];

export default function AvatarMotionStudio() {
  const [photos, setPhotos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [providerReady, setProviderReady] = useState(false);
  const [group, setGroup] = useState('avatar');
  const [selectedPhoto, setSelectedPhoto] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    Promise.all([apiFetch('/media?filter=photo'), apiFetch('/ai-avatar-motion')])
      .then(([media, setup]) => {
        setPhotos((media.items || []).slice(0, 40));
        setTemplates(setup.templates || []);
        setProviderReady(!!setup.providerReady);
      })
      .catch((error) => toast.error(error.message || 'Could not load Avatar & Motion Studio.'));
  }, []);

  const visibleTemplates = useMemo(() => templates.filter((item) => item.category === group), [templates, group]);
  const active = templates.find((item) => item.id === selectedTemplate);

  async function create() {
    if (!selectedPhoto) return toast.error('Choose a photo first.');
    if (!selectedTemplate) return toast.error('Choose a creation style.');
    setBusy(true);
    setResult(null);
    try {
      const response = await apiFetch('/ai-avatar-motion', {
        method: 'POST',
        body: JSON.stringify({ mediaId: selectedPhoto, templateId: selectedTemplate, prompt }),
      });
      setResult(response.job);
      toast.success('Your creation is ready.');
    } catch (error) {
      toast.error(error.message || 'Creation is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/ai-studio" className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft className="h-4 w-4"/> Back to AI Studio</Link>
          <h1 className="mt-3 text-3xl font-black">Avatar & Motion Studio</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Turn a profile photo into an animated avatar, create funny character looks, swap in ready-made backgrounds, or bring a still photo to life.</p>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${providerReady ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-100'}`}>{providerReady ? 'Creation engine ready' : 'Creation engine activating'}</div>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-500/10 to-cyan-500/10 p-5">
        <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-pink-300"/> Ready-to-use styles</div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {GROUPS.map((item) => <button key={item.id} onClick={() => { setGroup(item.id); setSelectedTemplate(''); }} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${group === item.id ? 'bg-white text-black' : 'bg-white/5 text-white/65'}`}>{item.label}</button>)}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((item) => (
            <button key={item.id} onClick={() => setSelectedTemplate(item.id)} className={`rounded-3xl border p-4 text-left transition ${selectedTemplate === item.id ? 'border-pink-400 bg-pink-500/10' : 'border-white/10 bg-black/15 hover:bg-white/[0.05]'}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-black">{item.name}</span>{item.output === 'video' ? <Film className="h-4 w-4 text-cyan-200"/> : <ImageIcon className="h-4 w-4 text-pink-200"/>}</div>
              <p className="mt-2 text-xs leading-5 text-white/55">{item.description}</p>
              <p className="mt-3 text-[11px] font-bold text-white/40">Estimated {item.credits} AI credits</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="font-black">Choose your photo</h2>
          {photos.length ? <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">{photos.map((photo) => <button key={photo.id} onClick={() => setSelectedPhoto(photo.id)} className={`aspect-square overflow-hidden rounded-2xl border-2 ${selectedPhoto === photo.id ? 'border-pink-400' : 'border-transparent'}`}><img src={mediaSrc(photo.id)} alt="" className="h-full w-full object-cover"/></button>)}</div> : <p className="mt-4 text-sm text-white/50">Upload a portrait or photo first.</p>}
          <label className="mt-5 block text-xs font-bold text-white/55">Optional direction</label>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={500} placeholder="Example: soft pastel colors, playful expression, clean background" className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-pink-400/50"/>
          <button onClick={create} disabled={busy || !selectedPhoto || !selectedTemplate} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wand2 className="h-4 w-4"/>} Create {active?.output === 'video' ? 'motion' : 'image'}</button>
          <p className="mt-3 text-xs leading-5 text-white/40">Nothing is posted or shared automatically. Failed generations do not use AI credits.</p>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="font-black">Preview</h2>
          <div className="mt-4 grid min-h-72 place-items-center overflow-hidden rounded-3xl border border-dashed border-white/10 bg-black/20">
            {result?.outputUrl ? (result.outputType === 'video' ? <video src={result.outputUrl} controls loop className="h-full w-full object-contain"/> : <img src={result.outputUrl} alt="AI creation" className="h-full w-full object-contain"/>) : selectedPhoto ? <img src={mediaSrc(selectedPhoto)} alt="Selected" className="h-full max-h-80 w-full object-contain opacity-70"/> : <div className="px-6 text-center text-sm text-white/35">Choose a photo and style to preview your creation.</div>}
          </div>
          {!providerReady && <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80">The workspace is ready, but production generation stays disabled until an approved image and motion provider is connected.</div>}
        </section>
      </div>
    </div>
  );
}
