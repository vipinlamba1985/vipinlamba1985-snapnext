'use client';

import { FileText, Film } from 'lucide-react';
import { mediaSrc } from '@/lib/api-client';

export default function MediaSection({ title, items, onOpen, onExpand, emptyCopy }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-white">{title}</h2>
        {!!items.length && <button onClick={() => onExpand?.()} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white/65">See all</button>}
      </div>
      {items.length === 0 ? <p className="mt-3 text-sm text-white/40">{emptyCopy || 'Nothing found here yet.'}</p> : (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {items.slice(0, 14).map((item, index) => (
            <button key={item.id} onClick={() => onOpen(item, index)} className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-white/5 text-left md:h-36 md:w-36">
              {item.kind === 'photo' ? <img src={mediaSrc(item.id)} alt="" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" /> : item.kind === 'video' ? <video src={mediaSrc(item.id)} className="absolute inset-0 h-full w-full object-cover" muted /> : <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-white/60"><FileText className="mb-2 h-5 w-5" />{item.aiAnalysis?.description || item.name}</div>}
              {item.kind === 'video' && <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-1 text-[10px] text-white"><Film className="h-3 w-3" /> Video</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
