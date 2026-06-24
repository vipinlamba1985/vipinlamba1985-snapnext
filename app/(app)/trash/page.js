'use client';
import { useEffect, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TrashPage() {
  const [items, setItems] = useState([]);
  async function load() { const d = await apiFetch('/media?filter=trash'); setItems(d.items || []); }
  useEffect(() => { load(); }, []);

  async function restore(id) { await apiFetch(`/media/${id}/restore`, { method:'POST' }); toast.success('Restored'); load(); }
  async function del(id) { await apiFetch(`/media/${id}/delete`, { method:'POST' }); toast('Deleted forever'); load(); }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Trash</h1>
        <p className="text-white/60 mt-1">Items will be removed permanently when you delete.</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-white/50">Trash is empty.</div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {items.map(m => (
            <div key={m.id} className="group relative aspect-square rounded-xl overflow-hidden bg-white/5">
              {m.kind === 'photo' ? <img src={mediaSrc(m.id)} className="h-full w-full object-cover opacity-70" alt=""/> : <video src={mediaSrc(m.id)} className="h-full w-full object-cover opacity-70" />}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition grid place-items-center gap-2">
                <button onClick={()=>restore(m.id)} className="text-xs px-3 py-1.5 rounded-full bg-white text-black inline-flex items-center gap-1"><RotateCcw className="h-3 w-3"/>Restore</button>
                <button onClick={()=>del(m.id)} className="text-xs px-3 py-1.5 rounded-full bg-rose-500 text-white inline-flex items-center gap-1"><Trash2 className="h-3 w-3"/>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
