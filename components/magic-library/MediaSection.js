'use client';

import { Film } from 'lucide-react';
import { mediaSrc } from '@/lib/api-client';

export default function MediaSection({ title, items, onOpen, emptyCopy }) {
  return (
    <section>
      <h2 className="text-xl font-black text-white">{title}</h2>
      {items.length === 0 ? <p className="mt-3 text-sm text-white/40">{emptyCopy || 'Nothing found here yet.'}</p> : (
        <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6">
          {items.map((item) => (
            <button key={item.id} onClick={() => onOpen(item)} className="group relative aspect-square overflow-hidden rounded-xl bg-white/5 text-left">
              {item.kind === 'photo' ? <img src={mediaSrc(item.id)} alt="" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" /> : item.kind === 'video' ? <video src={mediaSrc(item.id)} className="absolute inset-0 h-full w-full object-cover" muted /> : <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-white/60">{item.aiAnalysis?.description || item.name}</div>}
              {item.kind === 'video' && <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-1 text-[10px] text-white"><Film className="h-3 w-3" /> Video</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
