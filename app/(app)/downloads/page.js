'use client';
import { useEffect, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { Download, Loader2, Package, CheckCircle2, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_META = {
  queued:     { label: 'Queued',     color: 'text-white/70',     bg: 'bg-white/10' },
  processing: { label: 'Processing', color: 'text-sky-200',      bg: 'bg-sky-500/15' },
  ready:      { label: 'Ready',      color: 'text-emerald-200',  bg: 'bg-emerald-500/15' },
  failed:     { label: 'Failed',     color: 'text-rose-200',     bg: 'bg-rose-500/15' },
  expired:    { label: 'Expired',    color: 'text-white/40',     bg: 'bg-white/5' },
};

export default function DownloadsPage() {
  const [items, setItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [m, j] = await Promise.all([apiFetch('/media'), apiFetch('/exports')]);
    setItems(m.items || []); setJobs(j.jobs || []);
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    // Poll while any job is in-progress
    const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'processing');
    if (!hasActive) return;
    const t = setInterval(async () => { try { const j = await apiFetch('/exports'); setJobs(j.jobs || []); } catch {} }, 2500);
    return () => clearInterval(t);
  }, [jobs]);

  function toggle(id) { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); }
  function toggleAll() { selected.size === items.length ? setSelected(new Set()) : setSelected(new Set(items.map(i => i.id))); }

  async function startExport(type) {
    setBusy(true);
    try {
      const payload = type === 'all' ? { type: 'all' } : { type: 'selected', mediaIds: [...selected] };
      if (type === 'selected' && selected.size === 0) { toast.error('Select files first'); return; }
      await apiFetch('/exports', { method: 'POST', body: JSON.stringify(payload) });
      toast.success('Export queued — we\'ll notify you when it\'s ready');
      setSelected(new Set());
      loadAll();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function retry(id) {
    try { await apiFetch(`/exports/${id}/retry`, { method: 'POST' }); toast.success('Retrying export'); loadAll(); }
    catch (e) { toast.error(e.message); }
  }
  function downloadZip(job) {
    window.location.href = `/api/exports/${encodeURIComponent(job.id)}/download`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Downloads</h1>
        <p className="text-white/60 mt-1">Export your photos and videos as a ZIP archive. Ready exports stay available for 7 days.</p>
      </div>

      {/* Export actions */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-wrap items-center gap-3">
        <button onClick={() => startExport('selected')} disabled={busy || selected.size === 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-sm disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Package className="h-4 w-4"/>} Export selected ({selected.size})
        </button>
        <button onClick={() => startExport('all')} disabled={busy || items.length === 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm disabled:opacity-50">
          <Download className="h-4 w-4"/> Export everything ({items.length})
        </button>
        <button onClick={toggleAll} className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10 ml-auto">{selected.size === items.length && items.length ? 'Deselect all' : 'Select all'}</button>
      </div>

      {/* Export jobs */}
      {jobs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Export queue</h2>
            <button onClick={loadAll} className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><RefreshCw className="h-3.5 w-3.5"/>Refresh</button>
          </div>
          <div className="space-y-2">
            {jobs.map((j) => {
              const meta = STATUS_META[j.status] || STATUS_META.queued;
              return (
                <div key={j.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3 flex-wrap">
                  <Package className="h-5 w-5 text-fuchsia-300 flex-none"/>
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm font-medium truncate">{j.name}</div>
                    <div className="text-xs text-white/50 mt-0.5">{j.totalCount} items{j.bytes ? ` · ${formatBytes(j.bytes)}` : ''} · {new Date(j.createdAt).toLocaleString()}</div>
                    {j.status === 'processing' && (
                      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-pink-500 to-purple-600 transition-all" style={{ width: `${j.progress || 0}%` }}/>
                      </div>
                    )}
                    {j.error && <div className="text-xs text-rose-300 mt-1">{j.error}</div>}
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full ${meta.bg} ${meta.color} inline-flex items-center gap-1`}>
                    {j.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin"/>}
                    {j.status === 'ready' && <CheckCircle2 className="h-3 w-3"/>}
                    {j.status === 'failed' && <AlertTriangle className="h-3 w-3"/>}
                    {j.status === 'expired' && <Clock className="h-3 w-3"/>}
                    {meta.label}{j.status === 'processing' && j.progress != null ? ` · ${j.progress}%` : ''}
                  </span>
                  {j.status === 'ready' && <button onClick={() => downloadZip(j)} className="text-sm px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium inline-flex items-center gap-1"><Download className="h-3.5 w-3.5"/>Download ZIP</button>}
                  {(j.status === 'failed' || j.status === 'expired') && <button onClick={() => retry(j.id)} className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10 inline-flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5"/>Retry</button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Picker */}
      <section>
        <div className="text-sm text-white/60 mb-2">{items.length} files total — choose what to export</div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/5 max-h-[480px] overflow-y-auto">
          {items.map(m => (
            <label key={m.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.03]">
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4 accent-pink-500"/>
              <div className="h-10 w-10 rounded-lg overflow-hidden bg-white/5 flex-none">
                {m.kind === 'photo' ? <img src={mediaSrc(m.id)} className="h-full w-full object-cover" alt=""/> : <div className="h-full w-full grid place-items-center text-[10px]">VIDEO</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{m.name}</div>
                <div className="text-xs text-white/50">{formatBytes(m.size)}</div>
              </div>
            </label>
          ))}
          {items.length === 0 && <div className="p-10 text-center text-white/50">Nothing to download yet.</div>}
        </div>
      </section>
    </div>
  );
}
