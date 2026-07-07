'use client';

import { Download, Heart, Trash2, X } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';

export default function MediaViewer({ item, onClose, onChanged }) {
  if (!item) return null;

  async function download() {
    const res = await fetch(mediaSrc(item.id));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name || 'memory';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function favorite() {
    await apiFetch(`/media/${item.id}/favorite`, { method: 'POST' });
    toast.success('Favorite updated');
    onChanged?.();
  }

  async function trash() {
    await apiFetch(`/media/${item.id}/trash`, { method: 'POST' });
    toast.success('Moved to trash');
    onClose();
    onChanged?.();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 backdrop-blur" onClick={onClose}>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b0414]" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white"><X className="h-5 w-5" /></button>
        <div className="grid md:grid-cols-[1fr_280px]">
          <div className="grid min-h-[320px] place-items-center bg-black">
            {item.kind === 'photo' ? <img src={mediaSrc(item.id)} alt="" className="max-h-[80vh] w-full object-contain" /> : item.kind === 'video' ? <video src={mediaSrc(item.id)} className="max-h-[80vh] w-full" controls autoPlay /> : <div className="p-8 text-center text-white/70">{item.aiAnalysis?.description || item.name}</div>}
          </div>
          <aside className="p-5">
            <h2 className="truncate text-lg font-black text-white">{item.name}</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">{item.aiAnalysis?.description || 'Protected memory'}</p>
            <div className="mt-5 grid gap-2">
              <button onClick={favorite} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"><Heart className="mr-2 inline h-4 w-4" />Favorite</button>
              <button onClick={download} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"><Download className="mr-2 inline h-4 w-4" />Download</button>
              <button onClick={trash} className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100"><Trash2 className="mr-2 inline h-4 w-4" />Move to Trash</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
