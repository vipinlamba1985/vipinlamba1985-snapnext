'use client';
import { useEffect, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TrashPage() {
  const [items, setItems] = useState([]);
  async function load() { const d = await apiFetch('/media?filter=trash'); setItems(d.items || []); }
  useEffect(() => { load(); }, []);

  async function restore(id) { await apiFetch(`/media/${id}/restore`, { method: 'POST' }); toast.success('Restored'); load(); }
  async function del(id) { await apiFetch(`/media/${id}/delete`, { method: 'POST' }); toast('Deleted forever'); load(); }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Trash</h1>
        <p className="mt-1 text-white/60">Items are automatically removed after 30 days. You can restore or permanently delete them sooner.</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-white/50">Trash is empty.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6" aria-label="Items in trash">
          {items.map((m) => (
            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-white/5" tabIndex={0}>
              {m.kind === 'photo' ? <img src={mediaSrc(m.id)} className="h-full w-full object-cover opacity-70" alt={m.name || 'Trashed photo'} loading="lazy" /> : <video src={mediaSrc(m.id)} className="h-full w-full object-cover opacity-70" muted playsInline aria-label={m.name || 'Trashed video'} />}
              <div className="absolute inset-0 grid place-items-center gap-2 bg-black/55 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100">
                <div className="flex flex-col gap-2">
                  <button aria-label={`Restore ${m.name || 'item'}`} onClick={() => restore(m.id)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full bg-white px-3 py-2 text-xs text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><RotateCcw className="h-3 w-3" />Restore</button>
                  <button aria-label={`Permanently delete ${m.name || 'item'}`} onClick={() => del(m.id)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full bg-rose-500 px-3 py-2 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><Trash2 className="h-3 w-3" />Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
