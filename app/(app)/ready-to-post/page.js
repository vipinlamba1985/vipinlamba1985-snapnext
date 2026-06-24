'use client';
import { useEffect, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { Sparkles, Copy, Save, Send, Instagram, Facebook, Twitter, Smartphone } from 'lucide-react';

export default function ReadyToPost() {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [emojis, setEmojis] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { apiFetch('/media?filter=photo').then(d=>setPhotos(d.items?.slice(0,24) || [])).catch(()=>{}); }, []);

  async function craft() {
    if (!selected) { toast.error('Pick a photo first'); return; }
    setBusy(true);
    try {
      const c = await apiFetch('/ai/caption', { method:'POST', body: JSON.stringify({ mediaId: selected, mood:'warm', platform:'instagram' })});
      setCaption(c.caption);
      const h = await apiFetch('/ai/hashtags', { method:'POST', body: JSON.stringify({ text: c.caption })});
      setHashtags(h.hashtags);
      const e = await apiFetch('/ai/emojis', { method:'POST', body: JSON.stringify({ text: c.caption })});
      setEmojis(e.emojis);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const fullText = `${emojis} ${caption}\n\n${hashtags}`.trim();
  function copy() { navigator.clipboard.writeText(fullText); toast.success('Copied caption + hashtags + emojis'); }
  async function download() {
    if (!selected) return;
    const photo = photos.find(p => p.id === selected);
    const res = await fetch(mediaSrc(selected));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = photo?.name || 'export.jpg'; a.click();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ready to Post</h1>
        <p className="text-white/60 mt-1">Craft a complete post for any platform. Export-ready output.</p>
      </div>

      <div className="grid md:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-sm font-medium mb-3">Choose a photo</div>
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {photos.map(p => (
                <button key={p.id} onClick={()=>setSelected(p.id)} className={`relative aspect-square rounded-lg overflow-hidden border-2 ${selected === p.id ? 'border-pink-400' : 'border-transparent'}`}>
                  <img src={mediaSrc(p.id)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <button onClick={craft} disabled={busy} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60">
              <Sparkles className="h-4 w-4"/>{busy ? 'Crafting…' : 'AI craft full post'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div>
              <label className="text-xs text-white/60">Caption</label>
              <textarea value={caption} onChange={e=>setCaption(e.target.value)} rows={3} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-pink-400/50 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/60">Hashtags</label>
              <textarea value={hashtags} onChange={e=>setHashtags(e.target.value)} rows={2} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-pink-400/50 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/60">Emojis</label>
              <input value={emojis} onChange={e=>setEmojis(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-pink-400/50 text-lg" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={copy} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-sm font-medium"><Copy className="h-4 w-4"/> Copy full post</button>
              <button onClick={download} className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm"><Save className="h-4 w-4"/> Export image</button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-medium mb-3">Preview</div>
          <div className="rounded-xl bg-white text-black overflow-hidden">
            {selected && photos.find(p=>p.id===selected) && (
              <img src={mediaSrc(selected)} className="w-full aspect-square object-cover" alt="" />
            )}
            <div className="p-3 text-sm">
              <div className="font-medium mb-1">{emojis} {caption || 'Your caption appears here.'}</div>
              <div className="text-blue-600 text-xs">{hashtags}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2 text-xs text-white/60">
            {[Instagram, Facebook, Twitter, Smartphone, Send].map((I, i) => (
              <div key={i} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-white/5">
                <I className="h-4 w-4"/> <span>Soon</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-white/50">Direct posting requires platform approval. For now use “Export ready content”.</p>
        </div>
      </div>
    </div>
  );
}
