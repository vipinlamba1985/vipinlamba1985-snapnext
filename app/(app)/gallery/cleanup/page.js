'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, HardDrive, Loader2, Play, ShieldCheck, Sparkles, Trash2,
} from 'lucide-react';

const SAFETY_COPY = {
  safe: { label: 'Safe to clear', className: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100' },
  review: { label: 'Worth a look', className: 'border-amber-300/20 bg-amber-400/10 text-amber-100' },
};

export default function LibraryCleanupPage() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState('');

  async function load() {
    setLoading(true);
    try {
      setPlan(await apiFetch('/triage'));
      setSelected(new Set());
    } catch (error) {
      toast.error(error.message || 'Cleanup could not load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const buckets = plan?.buckets || [];
  const selectedBytes = useMemo(() => {
    const sizes = new Map();
    for (const bucket of buckets) for (const item of bucket.items) sizes.set(item.id, Number(item.size) || 0);
    return [...selected].reduce((total, id) => total + (sizes.get(id) || 0), 0);
  }, [buckets, selected]);

  const toggle = id => setSelected(current => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleBucket = bucket => setSelected(current => {
    const next = new Set(current);
    const ids = bucket.items.map(item => item.id);
    const allSelected = ids.every(id => next.has(id));
    ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
    return next;
  });

  async function moveSelectedToTrash() {
    if (!selected.size) return;
    setBusy('trash');
    try {
      // Reversible on purpose: cleanup proposes, Trash is the safety net, and
      // permanent deletion stays an explicit second step in Trash.
      await apiFetch('/media/bulk', { method: 'POST', body: JSON.stringify({ ids: [...selected], action: 'trash' }) });
      toast.success(`Moved ${selected.size} item${selected.size === 1 ? '' : 's'} to Trash. You can restore them from there.`);
      await load();
    } catch (error) {
      toast.error(error.message || 'Nothing was changed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-32 md:pb-12">
      <header>
        <Link href="/gallery" className="inline-flex items-center gap-1.5 text-xs font-bold text-white/50 hover:text-white/80"><ArrowLeft className="h-3.5 w-3.5" />Back to Library</Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Free up space</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
          Grouped from what SnapNext already knows about your files — sizes, dates and exact copies.
          Nothing is analysed and nothing is deleted until you choose.
        </p>
      </header>

      {loading ? <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-pink-300" /></div> : !plan ? null : (
        <>
          <section data-testid="cleanup-summary" className="rounded-[2rem] border border-white/8 bg-gradient-to-br from-purple-500/[0.10] to-pink-500/[0.06] p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[0.06]"><HardDrive className="h-6 w-6 text-purple-100" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black">{formatBytes(plan.totals.reclaimableBytes)} could be freed</h2>
                <p className="mt-1 text-sm text-white/50">
                  {formatBytes(plan.totals.safeBytes)} safe to clear · {formatBytes(plan.totals.reviewBytes)} worth reviewing · {plan.totals.scanned.toLocaleString()} items checked
                </p>
              </div>
            </div>
            {plan.truncated && <p className="mt-3 text-xs text-amber-100/80">Your library is larger than one cleanup pass. Clear some space and run it again to see the rest.</p>}
          </section>

          {!buckets.length ? (
            <div data-testid="cleanup-empty" className="rounded-[2rem] border border-dashed border-white/12 bg-white/[0.02] p-10 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/[0.05]"><Sparkles className="h-6 w-6 text-white/35" /></div>
              <h3 className="mt-4 text-xl font-black">Nothing to clean up</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">No duplicates, no oversized videos and nothing sitting in Trash. Your library is tidy.</p>
            </div>
          ) : buckets.map(bucket => {
            const safety = SAFETY_COPY[bucket.safety] || SAFETY_COPY.review;
            const allSelected = bucket.items.every(item => selected.has(item.id));
            return (
              <section key={bucket.id} data-testid={`cleanup-bucket-${bucket.id}`} className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black">{bucket.title}</h2>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${safety.className}`}>{safety.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-white/45">{bucket.detail}</p>
                    <p className="mt-1 text-xs font-bold text-white/35">
                      {bucket.count.toLocaleString()} item{bucket.count === 1 ? '' : 's'} · {formatBytes(bucket.reclaimableBytes)}
                      {bucket.id === 'duplicates' && bucket.groupCount ? ` · ${bucket.groupCount} duplicated file${bucket.groupCount === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <button data-testid={`cleanup-select-${bucket.id}`} onClick={() => toggleBucket(bucket)} className="min-h-10 shrink-0 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-white/70">
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-8">
                  {bucket.items.slice(0, 24).map(item => {
                    const isSelected = selected.has(item.id);
                    return (
                      <button key={item.id} data-testid={`cleanup-item-${item.id}`} onClick={() => toggle(item.id)} aria-pressed={isSelected} aria-label={`${isSelected ? 'Deselect' : 'Select'} ${item.name || 'item'} (${formatBytes(item.size)})`} className={`relative aspect-square overflow-hidden rounded-xl bg-white/[0.04] ring-inset ${isSelected ? 'ring-2 ring-pink-400' : ''}`}>
                        {item.kind === 'video'
                          ? <div className="grid h-full w-full place-items-center bg-black/40"><Play className="h-5 w-5 fill-white/70 text-white/70" /></div>
                          : <img src={mediaSrc(item.id)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                        <span className="absolute inset-x-1 bottom-1 truncate rounded-md bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white/80">{formatBytes(item.size)}</span>
                        {isSelected && <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-pink-500"><Check className="h-3 w-3 stroke-[3]" /></span>}
                      </button>
                    );
                  })}
                </div>
                {bucket.count > 24 && <p className="mt-2 text-xs text-white/35">Showing the 24 largest of {bucket.count.toLocaleString()}. &quot;Select all&quot; covers every item in this group.</p>}

                {bucket.id === 'trashed' && <Link href="/trash" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-white/70"><Trash2 className="h-3.5 w-3.5" />Open Trash to delete permanently</Link>}
              </section>
            );
          })}

          <section className="rounded-3xl border border-emerald-300/10 bg-emerald-400/[0.04] p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
              <p className="text-sm leading-6 text-white/50">Cleanup moves things to Trash, never straight to deletion. Originals imported from a connected account are left untouched at the source.</p>
            </div>
          </section>
        </>
      )}

      {selected.size > 0 && (
        <div data-testid="cleanup-action-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0414]/95 px-4 py-3 backdrop-blur-xl md:px-8">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{selected.size.toLocaleString()} selected</p>
              <p className="text-xs text-white/45">Frees about {formatBytes(selectedBytes)}</p>
            </div>
            <button onClick={() => setSelected(new Set())} className="min-h-11 rounded-full border border-white/10 px-4 text-xs font-black text-white/55">Clear</button>
            <button data-testid="cleanup-trash-selected" onClick={moveSelectedToTrash} disabled={busy === 'trash'} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 text-sm font-black disabled:opacity-50">
              {busy === 'trash' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Move to Trash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
