'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Film, Loader2, Save, Sparkles } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';

export default function MemoryStoryDirectorPage() {
  const [memories, setMemories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [direction, setDirection] = useState('Create a warm story that feels cinematic and true to these memories.');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    apiFetch('/media?filter=all').then(data => setMemories((data.items || []).filter(item => ['photo', 'video'].includes(item.kind)).slice(0, 80))).catch(error => toast.error(error.message));
  }, []);

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 10 ? current : [...current, id]);
  }

  async function generate() {
    if (!selected.length) return toast.error('Choose at least one memory.');
    setBusy('generate'); setResult(null);
    try {
      const response = await apiFetch('/memory-story-director', { method: 'POST', body: JSON.stringify({ memoryIds: selected, direction, aspectRatio, durationSeconds }) });
      setResult(response);
      toast.success('Your memory story draft is ready.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function save() {
    if (!result?.draftId) return;
    setBusy('save');
    try {
      await apiFetch('/memory-story-director', { method: 'POST', body: JSON.stringify({ action: 'save', draftId: result.draftId, approved: true }) });
      setResult(current => ({ ...current, consentState: 'approved' }));
      toast.success('Story saved to your creative projects.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  function copy(text) { navigator.clipboard.writeText(text || ''); toast.success('Copied'); }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <Link href="/ai-studio" className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft className="h-4 w-4"/> Back to AI Studio</Link>
        <h1 className="mt-3 text-3xl font-black">Memory Story Director</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Choose your own memories and turn them into a grounded story, reel plan, voice-over, caption and image prompt. Nothing is posted automatically.</p>
      </header>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center justify-between"><h2 className="font-black">Choose 1–10 memories</h2><span className="text-xs text-white/45">{selected.length}/10 selected</span></div>
        {memories.length ? <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-10">{memories.map(memory => <button key={memory.id} onClick={() => toggle(memory.id)} className={`relative aspect-square overflow-hidden rounded-2xl border-2 ${selectedSet.has(memory.id) ? 'border-pink-400' : 'border-transparent'}`}><img src={mediaSrc(memory.id)} alt="" className="h-full w-full object-cover"/>{selectedSet.has(memory.id) && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-pink-500"><Check className="h-3.5 w-3.5"/></span>}</button>)}</div> : <p className="mt-4 text-sm text-white/45">Upload memories first.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <div><label className="text-xs font-bold text-white/55">How should the story feel?</label><textarea value={direction} onChange={event => setDirection(event.target.value)} maxLength={800} className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/></div>
          <div><label className="text-xs font-bold text-white/55">Format</label><div className="mt-2 flex flex-wrap gap-2">{['9:16','1:1','4:5','16:9'].map(ratio => <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`rounded-full px-4 py-2 text-sm font-bold ${aspectRatio === ratio ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>{ratio}</button>)}</div></div>
          <div><label className="text-xs font-bold text-white/55">Length</label><div className="mt-2 flex gap-2">{[15,30,45,60].map(value => <button key={value} onClick={() => setDurationSeconds(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${durationSeconds === value ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>{value}s</button>)}</div></div>
          <button onClick={generate} disabled={busy || !selected.length} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black disabled:opacity-40">{busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>} Create story package</button>
          <p className="text-xs leading-5 text-white/40">Uses your existing AI Credits. The result stays a draft until you approve and save it.</p>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="font-black">Story draft</h2>
          {!result ? <div className="mt-4 grid min-h-72 place-items-center rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 text-center text-sm leading-6 text-white/35">Your title, story, scenes, voice-over and social copy will appear here.</div> : <div className="mt-4 space-y-4">
            <div><h3 className="text-xl font-black">{result.story.title}</h3><p className="mt-2 text-sm leading-6 text-white/60">{result.story.summary}</p></div>
            <Result label="Caption" value={result.story.caption} onCopy={copy}/>
            <Result label="Image prompt" value={result.story.imagePrompt} onCopy={copy}/>
            <div className="rounded-2xl bg-black/20 p-4"><div className="flex items-center gap-2 text-sm font-black"><Film className="h-4 w-4"/> {result.story.video.durationSeconds}s scene plan</div><div className="mt-3 space-y-3">{result.story.video.scenes.map(scene => <div key={scene.order} className="border-l-2 border-purple-400/40 pl-3"><div className="text-xs font-bold">Scene {scene.order} · {scene.durationSeconds}s</div><div className="mt-1 text-xs leading-5 text-white/55">{scene.visual}</div></div>)}</div></div>
            <button onClick={save} disabled={busy || result.consentState === 'approved'} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-50">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>} {result.consentState === 'approved' ? 'Saved' : 'Approve and save story'}</button>
          </div>}
        </section>
      </div>
    </div>
  );
}

function Result({ label, value, onCopy }) {
  return <div className="rounded-2xl bg-black/20 p-4"><div className="flex items-center justify-between text-xs font-bold text-white/50"><span>{label}</span><button onClick={() => onCopy(value)} className="inline-flex items-center gap-1 hover:text-white"><Copy className="h-3.5 w-3.5"/> Copy</button></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">{value}</p></div>;
}
