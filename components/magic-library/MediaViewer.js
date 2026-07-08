'use client';

import { ChevronLeft, ChevronRight, Download, Heart, Send, Trash2, X } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { useMemo, useState } from 'react';

export default function MediaViewer({ item, items = [], index = 0, onClose, onChanged }) {
  const [currentIndex, setCurrentIndex] = useState(index || 0);
  const list = useMemo(() => items.length ? items : item ? [item] : [], [items, item]);
  const current = list[currentIndex] || item;
  if (!current) return null;
  function move(step) { setCurrentIndex((value) => (value + step + list.length) % list.length); }
  async function download() { const res = await fetch(mediaSrc(current.id)); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = current.name || 'memory'; a.click(); URL.revokeObjectURL(url); }
  async function favorite() { await apiFetch(`/media/${current.id}/favorite`, { method: 'POST' }); toast.success('Favorite updated'); onChanged?.(); }
  async function trash() { await apiFetch(`/media/${current.id}/trash`, { method: 'POST' }); toast.success('Moved to trash'); onClose(); onChanged?.(); }
  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 z-20 rounded-full bg-white/15 p-3 text-white"><X className="h-6 w-6" /></button>
      {list.length > 1 && <><button onClick={(e) => { e.stopPropagation(); move(-1); }} className="absolute left-3 top-1/2 z-20 rounded-full bg-white/15 p-3 text-white"><ChevronLeft className="h-7 w-7" /></button><button onClick={(e) => { e.stopPropagation(); move(1); }} className="absolute right-3 top-1/2 z-20 rounded-full bg-white/15 p-3 text-white"><ChevronRight className="h-7 w-7" /></button></>}
      <div className="flex h-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 grid place-items-center p-4 pt-16 pb-28">
          {current.kind === 'photo' ? <img src={mediaSrc(current.id)} alt="" className="max-h-full max-w-full object-contain" /> : current.kind === 'video' ? <video src={mediaSrc(current.id)} className="max-h-full max-w-full" controls autoPlay /> : <div className="max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/75">{current.aiAnalysis?.description || current.name}</div>}
        </div>
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-[#0b0414]/95 p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-black text-white">{current.name}</h2><p className="text-xs text-white/45">Swipe or tap arrows · {currentIndex + 1} of {list.length}</p></div></div>
          <div className="grid grid-cols-4 gap-2"><button onClick={favorite} className="rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-xs font-bold text-white"><Heart className="mx-auto mb-1 h-4 w-4" />Favorite</button><button onClick={download} className="rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-xs font-bold text-white"><Download className="mx-auto mb-1 h-4 w-4" />Download</button><button onClick={() => toast('Ready-to-post action coming from this memory')} className="rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-2 py-3 text-xs font-bold text-white"><Send className="mx-auto mb-1 h-4 w-4" />Social post</button><button onClick={trash} className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-2 py-3 text-xs font-bold text-rose-100"><Trash2 className="mx-auto mb-1 h-4 w-4" />Trash</button></div>
        </div>
      </div>
    </div>
  );
}
