'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { Sparkles, Hash, Smile, Loader2, Copy, ImageIcon, Wand2, ThumbsUp, ThumbsDown, Gauge } from 'lucide-react';

export default function AIStudio() {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [topic, setTopic] = useState('');
  const [mood, setMood] = useState('warm');
  const [platform, setPlatform] = useState('instagram');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [emojis, setEmojis] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [busy, setBusy] = useState('');
  const [aiStatus, setAiStatus] = useState(null);
  const [lastAiMeta, setLastAiMeta] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    apiFetch('/ai/status?feature=caption').then(setAiStatus).catch(() => {});
  }, []);

  useEffect(() => { apiFetch('/media?filter=photo').then(d=>setPhotos(d.items?.slice(0, 24) || [])).catch(()=>{}); }, []);

  async function previewTask(kind = 'caption') {
    setBusy('preview');
    try {
      const feature = kind === 'ideas' ? 'postIdeas' : kind === 'all' ? 'doAll' : kind;
      const res = await apiFetch('/ai-os/preview', {
        method: 'POST',
        body: JSON.stringify({
          task: topic || caption || 'Create a social media post from my SnapNext memory',
          feature,
          qualityMode: mood === 'epic' || mood === 'cinematic' ? 'premium' : 'balanced',
          input: { topic, mood, platform, mediaId: selected },
        }),
      });
      setPreview(res);
      toast.success('AI task preview ready.');
    } catch (e) {
      toast.error(e.message || 'Unable to preview AI task.');
    } finally { setBusy(''); }
  }

  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'caption') {
        const res = await apiFetch('/ai/caption', { method:'POST', body: JSON.stringify({ topic, mood, platform, mediaId: selected }) });
        setCaption(res.caption);
        setLastAiMeta({ agentId: 'creator', feature: 'caption', requestId: res.meta?.requestId || null });
      } else if (kind === 'hashtags') {
        const res = await apiFetch('/ai/hashtags', { method:'POST', body: JSON.stringify({ text: caption || topic || 'photo memory' }) });
        setHashtags(res.hashtags);
        setLastAiMeta({ agentId: 'creator', feature: 'hashtags', requestId: res.meta?.requestId || null });
      } else if (kind === 'emojis') {
        const res = await apiFetch('/ai/emojis', { method:'POST', body: JSON.stringify({ text: caption || topic || 'photo memory' }) });
        setEmojis(res.emojis);
        setLastAiMeta({ agentId: 'creator', feature: 'emojis', requestId: res.meta?.requestId || null });
      } else if (kind === 'ideas') {
        const res = await apiFetch('/ai/post-ideas', { method:'POST', body: JSON.stringify({ topic: topic || 'recent memories' }) });
        setIdeas(res.ideas || []);
        setLastAiMeta({ agentId: 'creator', feature: 'postIdeas', requestId: res.meta?.requestId || null });
      } else if (kind === 'all') {
        await run('caption'); await run('hashtags'); await run('emojis');
      }
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }
  function copy(s) { navigator.clipboard.writeText(s); toast.success('Copied'); }

  async function sendFeedback(rating) {
    try {
      await apiFetch('/ai-os/feedback', {
        method: 'POST',
        body: JSON.stringify({
          agentId: lastAiMeta?.agentId || 'creator',
          feature: lastAiMeta?.feature || 'caption',
          requestId: lastAiMeta?.requestId || null,
          rating,
        }),
      });
      toast.success('Thanks — SnapNext AI will learn from this.');
    } catch (e) {
      toast.error(e.message || 'Unable to save feedback.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Studio</h1>
        <p className="text-white/60 mt-1">Captions, hashtags, emojis, and post ideas powered by SnapNext AI.</p>
        {aiStatus && (
          <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70">
            <span>{aiStatus.plan} Plan</span>
            <span className="text-white/30">•</span>
            <span>{aiStatus.monthlyCredits} monthly AI credits</span>
            <span className="text-white/30">•</span>
            <span>Caption uses {aiStatus.creditsRequired} credit</span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Controls */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-sm font-medium mb-3 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-pink-300"/> Pick a photo (optional)</div>
            {photos.length === 0 ? <div className="text-sm text-white/50">Upload photos to caption them with vision AI.</div> : (
              <div className="grid grid-cols-6 md:grid-cols-8 gap-2">
                {photos.map(p => (
                  <button key={p.id} onClick={()=>setSelected(selected === p.id ? null : p.id)} className={`relative aspect-square rounded-lg overflow-hidden border-2 ${selected === p.id ? 'border-pink-400' : 'border-transparent'}`}>
                    <img src={mediaSrc(p.id)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
            <div>
              <label className="text-xs text-white/60">Topic / context</label>
              <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. sunset hike with friends" className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-pink-400/50"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/60">Mood</label>
                <select value={mood} onChange={e=>setMood(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none">
                  {['warm','funny','cinematic','poetic','minimalist','epic'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/60">Platform</label>
                <select value={platform} onChange={e=>setPlatform(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none">
                  {['instagram','tiktok','x','facebook','snapchat'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Btn onClick={()=>previewTask('caption')} busy={busy==='preview'} icon={Gauge}>Preview cost</Btn>
              <Btn onClick={()=>run('caption')} busy={busy==='caption'} icon={Sparkles} grad>Caption</Btn>
              <Btn onClick={()=>run('hashtags')} busy={busy==='hashtags'} icon={Hash}>Hashtags</Btn>
              <Btn onClick={()=>run('emojis')} busy={busy==='emojis'} icon={Smile}>Emojis</Btn>
              <Btn onClick={()=>run('ideas')} busy={busy==='ideas'} icon={Wand2}>Post ideas</Btn>
              <Btn onClick={()=>run('all')} busy={busy==='all'} icon={Sparkles}>Do it all</Btn>
            </div>
          </div>

          {preview && (
            <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-5">
              <div className="text-sm font-semibold">AI Task Preview</div>
              <div className="mt-3 grid gap-2 text-xs text-white/70 sm:grid-cols-2">
                <div>Agent: <span className="text-white">{preview.selectedAgent?.name}</span></div>
                <div>Credits: <span className="text-white">{preview.economy?.requiredCredits ?? '—'}</span></div>
                <div>Quality: <span className="text-white">{preview.qualityMode}</span></div>
                <div>Choice needed: <span className="text-white">{preview.requiresUserChoice ? 'Yes' : 'No'}</span></div>
              </div>
              <p className="mt-3 text-xs text-white/60">{preview.userMessage}</p>
              {preview.options?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{preview.options.slice(0,3).map(o => <span key={o.label} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70">{o.label}: {o.credits} credits</span>)}</div>}
              {!preview.economy?.allowed && <Link href="/billing" className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black">Upgrade / buy credits</Link>}
            </div>
          )}

          {ideas.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-sm font-medium mb-2">Post ideas</div>
              <ul className="space-y-2 text-sm">
                {ideas.map((i,idx) => <li key={idx} className="flex items-start gap-2"><span className="text-pink-300">{idx+1}.</span> <span className="flex-1">{i}</span><button onClick={()=>copy(i)} className="text-white/40 hover:text-white"><Copy className="h-3.5 w-3.5"/></button></li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Result */}
        <div className="space-y-4">
          <ResultCard label="Caption" value={caption} onCopy={()=>copy(caption)} />
          <ResultCard label="Hashtags" value={hashtags} onCopy={()=>copy(hashtags)} />
          <ResultCard label="Emojis" value={emojis} onCopy={()=>copy(emojis)} mono />
          {(caption || hashtags || emojis || ideas.length > 0) && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/60">Help SnapNext AI learn</div>
              <div className="mt-3 flex gap-2">
                <button onClick={()=>sendFeedback('accepted')} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs hover:bg-white/15"><ThumbsUp className="h-3.5 w-3.5"/> Good result</button>
                <button onClick={()=>sendFeedback('rejected')} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs hover:bg-white/15"><ThumbsDown className="h-3.5 w-3.5"/> Needs work</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, busy, icon: Icon, grad }) {
  return (
    <button onClick={onClick} disabled={busy} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50 ${grad ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/5 border border-white/10'}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Icon className="h-3.5 w-3.5"/>} {children}
    </button>
  );
}

function ResultCard({ label, value, onCopy, mono }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between text-xs text-white/60"><span>{label}</span>{value && <button onClick={onCopy} className="inline-flex items-center gap-1 hover:text-white"><Copy className="h-3 w-3"/> Copy</button>}</div>
      <div className={`mt-2 min-h-[60px] text-sm whitespace-pre-wrap ${mono ? 'text-2xl' : ''}`}>{value || <span className="text-white/30">Result will appear here.</span>}</div>
    </div>
  );
}
