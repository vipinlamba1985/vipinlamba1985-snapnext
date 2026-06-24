'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { Search, Heart, Trash2, Download, X, Star, CheckCircle2, Image as ImageIcon, Film, Sparkles, Share2, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function GalleryPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [viewer, setViewer] = useState(null);
  const [aiCaption, setAiCaption] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [favSearch, setFavSearch] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [albums, setAlbums] = useState([]);
  const [shareTab, setShareTab] = useState('favorite');
  const [pickedAlbum, setPickedAlbum] = useState('');
  const [sharing, setSharing] = useState(false);

  async function load() {
    const params = new URLSearchParams({ filter });
    if (q) params.set('q', q);
    try { const d = await apiFetch('/media?' + params); setItems(d.items || []); } catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  async function bulk(action) {
    if (!selected.size) return;
    await apiFetch('/media/bulk', { method:'POST', body: JSON.stringify({ ids: Array.from(selected), action }) });
    setSelected(new Set());
    load();
    toast.success('Done');
  }
  async function favorite(id) {
    await apiFetch(`/media/${id}/favorite`, { method:'POST' });
    load();
  }
  async function trash(id) {
    await apiFetch(`/media/${id}/trash`, { method:'POST' });
    setViewer(null);
    load();
    toast('Moved to trash');
  }
  async function downloadOne(item) {
    const res = await fetch(mediaSrc(item.id));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = item.name; a.click();
    URL.revokeObjectURL(url);
    apiFetch('/downloads/log', { method:'POST', body: JSON.stringify({ mediaIds: [item.id] }) }).catch(()=>{});
  }
  async function aiCaptionFor(item) {
    setAiBusy(true); setAiCaption('');
    try {
      const { caption } = await apiFetch('/ai/caption', { method:'POST', body: JSON.stringify({ mediaId: item.id, mood: 'warm', platform: 'instagram' }) });
      setAiCaption(caption);
    } catch (e) { toast.error(e.message); }
    finally { setAiBusy(false); }
  }

  async function openShare(mediaIds) {
    setShareOpen({ mediaIds });
    setPicked(new Set()); setPickedAlbum(''); setShareTab('favorite');
    try {
      const [f, a] = await Promise.all([apiFetch('/favorites'), apiFetch('/shared/albums')]);
      setFavorites(f.accepted || []);
      setAlbums(a.owned || []);
    } catch (e) { toast.error(e.message); }
  }

  async function doShare() {
    if (!shareOpen) return;
    setSharing(true);
    try {
      if (shareTab === 'favorite') {
        if (picked.size === 0) { toast.error('Pick a favorite'); return; }
        let count = 0;
        for (const fav of favorites.filter(f => picked.has(f.id))) {
          const r = await apiFetch('/shared/photos', { method: 'POST', body: JSON.stringify({ recipientUserId: fav.other.id, mediaIds: shareOpen.mediaIds }) });
          count += r.shared || 0;
        }
        const names = favorites.filter(f => picked.has(f.id)).map(f => f.other.name);
        toast.success(names.length === 1 ? `Shared with ${names[0]}` : `Shared with ${names.length} favorites`);
      } else {
        if (!pickedAlbum) { toast.error('Pick an album'); return; }
        await apiFetch(`/shared/albums/${pickedAlbum}/add-media`, { method: 'POST', body: JSON.stringify({ mediaIds: shareOpen.mediaIds }) });
        toast.success(`Added to album`);
      }
      setShareOpen(false); setSelected(new Set());
    } catch (e) { toast.error(e.message); }
    finally { setSharing(false); }
  }

  const filters = [
    { id:'all', label:'All', icon: ImageIcon },
    { id:'photo', label:'Photos', icon: ImageIcon },
    { id:'video', label:'Videos', icon: Film },
    { id:'favorite', label:'Favorites', icon: Heart },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">Gallery</h1>
        <div className="flex items-center gap-2 flex-1 max-w-md ml-auto">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name" className="w-full pl-9 pr-3 py-2 rounded-full bg-white/5 border border-white/10 text-sm outline-none focus:border-pink-400/40" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {filters.map(f => (
          <button key={f.id} onClick={()=>setFilter(f.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filter === f.id ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'bg-white/5 border border-white/10 text-white/70'}`}>
            <f.icon className="h-3.5 w-3.5"/> {f.label}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 rounded-2xl border border-white/10 bg-[#0b0414]/90 backdrop-blur px-3 py-2 flex items-center gap-2">
          <div className="text-sm">{selected.size} selected</div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => openShare([...selected])} className="text-sm px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium"><Share2 className="h-3.5 w-3.5 inline mr-1"/>Share</button>
            <button onClick={()=>bulk('favorite')} className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><Heart className="h-3.5 w-3.5 inline mr-1"/>Favorite</button>
            <button onClick={()=>bulk('trash')} className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><Trash2 className="h-3.5 w-3.5 inline mr-1"/>Trash</button>
            <button onClick={()=>setSelected(new Set())} className="text-sm px-2 py-1.5 rounded-full hover:bg-white/5"><X className="h-4 w-4"/></button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {items.map(m => (
            <div key={m.id} className="group relative aspect-square rounded-xl overflow-hidden bg-white/5 cursor-pointer" onClick={() => { setViewer(m); setAiCaption(''); }}>
              {m.kind === 'photo' ? (
                <img src={mediaSrc(m.id)} alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition" />
              ) : (
                <video src={mediaSrc(m.id)} className="absolute inset-0 h-full w-full object-cover" muted />
              )}
              <button onClick={(e)=>{e.stopPropagation(); toggle(m.id);}} className={`absolute top-2 left-2 h-6 w-6 rounded-full grid place-items-center border ${selected.has(m.id) ? 'bg-pink-500 border-pink-500' : 'bg-black/40 border-white/30'}`}>
                {selected.has(m.id) && <CheckCircle2 className="h-4 w-4"/>}
              </button>
              {m.favorite && <Star className="absolute top-2 right-2 h-4 w-4 text-amber-300 fill-amber-300" />}
              {m.kind === 'video' && <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 px-1.5 rounded">VIDEO</div>}
            </div>
          ))}
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur p-4 flex items-center justify-center" onClick={()=>setViewer(null)}>
          <div className="max-w-5xl w-full max-h-full grid md:grid-cols-[1fr_320px] gap-4" onClick={(e)=>e.stopPropagation()}>
            <div className="relative rounded-2xl overflow-hidden bg-black grid place-items-center">
              {viewer.kind === 'photo' ? <img src={mediaSrc(viewer.id)} className="max-h-[80vh] w-full object-contain" alt="" />
               : <video src={mediaSrc(viewer.id)} className="max-h-[80vh] w-full" controls autoPlay />}
            </div>
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-col">
              <div className="flex items-center justify-between"><div className="truncate font-medium">{viewer.name}</div><button onClick={()=>setViewer(null)}><X className="h-5 w-5"/></button></div>
              <div className="text-xs text-white/50 mt-1">{new Date(viewer.createdAt).toLocaleString()}</div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                <button onClick={()=>favorite(viewer.id)} className="text-xs py-2 rounded-xl bg-white/5 border border-white/10"><Heart className="h-4 w-4 mx-auto mb-1"/>Favorite</button>
                <button onClick={()=>openShare([viewer.id])} className="text-xs py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium"><Share2 className="h-4 w-4 mx-auto mb-1"/>Share</button>
                <button onClick={()=>downloadOne(viewer)} className="text-xs py-2 rounded-xl bg-white/5 border border-white/10"><Download className="h-4 w-4 mx-auto mb-1"/>Download</button>
                <button onClick={()=>trash(viewer.id)} className="text-xs py-2 rounded-xl bg-white/5 border border-white/10"><Trash2 className="h-4 w-4 mx-auto mb-1"/>Trash</button>
              </div>
              {viewer.kind === 'photo' && (
                <div className="mt-4 rounded-xl bg-gradient-to-br from-pink-500/10 to-purple-600/10 border border-white/10 p-3">
                  <button onClick={()=>aiCaptionFor(viewer)} disabled={aiBusy} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-sm font-medium">
                    <Sparkles className="h-4 w-4"/> {aiBusy ? 'Crafting…' : 'Generate AI caption'}
                  </button>
                  {aiCaption && <div className="mt-3 text-sm whitespace-pre-wrap">{aiCaption}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {shareOpen && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur p-4 grid place-items-center" onClick={() => setShareOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0414] p-6 relative">
            <button onClick={() => setShareOpen(false)} className="absolute top-4 right-4 text-white/60 hover:text-white"><X className="h-5 w-5"/></button>
            <div className="text-lg font-semibold flex items-center gap-2"><Share2 className="h-5 w-5 text-pink-300"/> Share {shareOpen.mediaIds.length} {shareOpen.mediaIds.length === 1 ? 'photo' : 'photos'}</div>
            <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
              <button onClick={()=>setShareTab('favorite')} className={`px-4 py-1 rounded-full ${shareTab === 'favorite' ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'text-white/60'}`}>With favorite</button>
              <button onClick={()=>setShareTab('album')} className={`px-4 py-1 rounded-full ${shareTab === 'album' ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'text-white/60'}`}>To album</button>
            </div>

            {shareTab === 'favorite' ? (
              <div className="mt-4">
                <div className="relative mb-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"/>
                  <input value={favSearch} onChange={(e)=>setFavSearch(e.target.value)} placeholder="Search favorites" className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm outline-none focus:border-pink-400/50"/>
                </div>
                {favorites.length === 0 ? (
                  <div className="text-center py-6 text-sm text-white/50">No favorites yet. <a href="/favorites" className="text-pink-300 underline">Add one →</a></div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-1.5">
                    {favorites.filter(f => !favSearch || f.other.name.toLowerCase().includes(favSearch.toLowerCase()) || f.other.email?.toLowerCase().includes(favSearch.toLowerCase())).map(f => {
                      const sel = picked.has(f.id);
                      return (
                        <button key={f.id} onClick={()=>{ const n = new Set(picked); sel ? n.delete(f.id) : n.add(f.id); setPicked(n); }}
                          className={`w-full flex items-center gap-3 p-2 rounded-xl transition ${sel ? 'bg-pink-500/10 border border-pink-400/40' : 'border border-transparent hover:bg-white/5'}`}>
                          <div className="h-9 w-9 grid place-items-center rounded-full font-semibold" style={{ background: f.other.avatarColor || '#a855f7' }}>{f.other.name?.[0]?.toUpperCase()}</div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-medium truncate">{f.other.name}</div>
                            <div className="text-xs text-white/50 truncate">{f.other.email}</div>
                          </div>
                          {sel && <CheckCircle2 className="h-5 w-5 text-pink-400"/>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                {albums.length === 0 ? (
                  <div className="text-center py-6 text-sm text-white/50">No albums yet. <a href="/favorites" className="text-pink-300 underline">Create one →</a></div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {albums.map(a => (
                      <button key={a.id} onClick={()=>setPickedAlbum(a.id)} className={`w-full p-3 rounded-xl text-left transition ${pickedAlbum === a.id ? 'bg-pink-500/10 border border-pink-400/40' : 'border border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-white/50">Created {new Date(a.createdAt).toLocaleDateString()}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="mt-3 text-[11px] text-white/50">Recipients only see what your permissions allow. You can revoke anytime from <a href="/favorites" className="text-pink-300 underline">Favorites</a>.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShareOpen(false)} className="text-sm px-4 py-2 rounded-full bg-white/5 border border-white/10">Cancel</button>
              <button onClick={doShare} disabled={sharing || (shareTab === 'favorite' && picked.size === 0) || (shareTab === 'album' && !pickedAlbum)} className="text-sm px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-50">
                {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1"/> : <Send className="h-3.5 w-3.5 inline mr-1"/>}
                {shareTab === 'favorite' ? `Share${picked.size ? ` (${picked.size})` : ''}` : 'Add to album'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <Link href="/upload" className="block rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center"><ImageIcon className="h-5 w-5"/></div>
      <div className="mt-3 font-medium">Your gallery is empty</div>
      <div className="text-sm text-white/60">Upload some photos to get started.</div>
    </Link>
  );
}
