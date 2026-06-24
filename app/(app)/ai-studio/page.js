'use client';
import { useEffect, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { Sparkles, Hash, Smile, Loader2, Copy, ImageIcon, Wand2 } from 'lucide-react';

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

  useEffect(() => { apiFetch('/media?filter=photo').then(d=>setPhotos(d.items?.slice(0, 24) || [])).catch(()=>{}); }, []);

  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'caption') {
        const { caption } = await apiFetch('/ai/caption', { method:'POST', body: JSON.stringify({ topic, mood, platform, mediaId: selected }) });
        setCaption(caption);
      } else if (kind === 'hashtags') {
        const { hashtags } = await apiFetch('/ai/hashtags', { method:'POST', body: JSON.stringify({ text: caption || topic || 'photo memory' }) });
        setHashtags(hashtags);
      } else if (kind === 'emojis') {
        const { emojis } = await apiFetch('/ai/emojis', { method:'POST', body: JSON.stringify({ text: caption || topic || 'photo memory' }) });
        setEmojis(emojis);
      } else if (kind === 'ideas') {
        const { ideas } = await apiFetch('/ai/post-ideas', { method:'POST', body: JSON.stringify({ topic: topic || 'recent memories' }) });
        setIdeas(ideas || []);
      } else if (kind === 'all') {
        await run('caption'); await run('hashtags'); await run('emojis');
      }
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }
  function copy(s) { navigator.clipboard.writeText(s); toast.success('Copied'); }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Studio</h1>
        <p className="text-white/60 mt-1">Captions, hashtags, emojis, and post ideas powered by SnapNext AI.</p>
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
              <Btn onClick={()=>run('caption')} busy={busy==='caption'} icon={Sparkles} grad>Caption</Btn>
              <Btn onClick={()=>run('hashtags')} busy={busy==='hashtags'} icon={Hash}>Hashtags</Btn>
              <Btn onClick={()=>run('emojis')} busy={busy==='emojis'} icon={Smile}>Emojis</Btn>
              <Btn onClick={()=>run('ideas')} busy={busy==='ideas'} icon={Wand2}>Post ideas</Btn>
              <Btn onClick={()=>run('all')} busy={busy==='all'} icon={Sparkles}>Do it all</Btn>
            </div>
          </div>

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
