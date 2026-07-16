'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Layers3, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

export default function CloudImportBatchGuide({ selected = 0, batchSize = 10, maxFiles = 500, progress = null }) {
  const totalBatches = Math.max(1, Math.ceil((progress?.total || selected || 1) / batchSize));
  const currentBatch = progress ? Math.min(totalBatches, Math.floor(progress.completed / batchSize) + (progress.completed < progress.total ? 1 : 0)) : 0;
  const [autoSync, setAutoSync] = useState({ loading: true, connected: false, enabled: false, lastSyncAt: null, lastResult: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/cloud/google-drive/auto-sync')
      .then(data => setAutoSync({ loading: false, ...data }))
      .catch(() => setAutoSync(current => ({ ...current, loading: false })));
  }, []);

  async function toggleAutoSync() {
    if (!autoSync.connected || saving) return;
    const enabled = !autoSync.enabled;
    setSaving(true);
    try {
      await apiFetch('/cloud/google-drive/auto-sync', { method: 'POST', body: JSON.stringify({ enabled }) });
      setAutoSync(current => ({ ...current, enabled }));
      toast.success(enabled ? 'Automatic sync is on. New Drive memories will be checked daily.' : 'Automatic sync is off. Nothing already saved was removed.');
    } catch (error) {
      toast.error(error.message || 'We could not change automatic sync.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400/15"><Layers3 className="h-4 w-4 text-cyan-200" /></div>
          <div>
            <p className="text-sm font-black">How your import works</p>
            <p className="mt-1 text-xs leading-5 text-white/60">Choose up to {maxFiles} photos or videos for one import. SnapNext automatically saves {batchSize} at a time, so you do not need to divide them into smaller groups.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-white/60">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> {selected} selected</span>
              <span className="rounded-full bg-black/20 px-3 py-1.5">{batchSize} per automatic batch</span>
              {progress && <span className="rounded-full bg-black/20 px-3 py-1.5">Batch {currentBatch} of {totalBatches}</span>}
            </div>
          </div>
        </div>
      </div>

      {autoSync.connected && (
        <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-400/15"><RefreshCw className="h-4 w-4 text-purple-200" /></div>
              <div>
                <p className="text-sm font-black">Continue syncing automatically</p>
                <p className="mt-1 text-xs leading-5 text-white/60">When enabled, SnapNext checks Google Drive once each day and copies only new photos and videos added after you turn this on. Duplicates are skipped and your storage limit still applies.</p>
                {autoSync.lastSyncAt && <p className="mt-2 text-[11px] text-white/45">Last checked {new Date(autoSync.lastSyncAt).toLocaleString()}</p>}
              </div>
            </div>
            <button onClick={toggleAutoSync} disabled={autoSync.loading || saving} aria-pressed={autoSync.enabled} className={`relative h-7 w-12 shrink-0 rounded-full transition ${autoSync.enabled ? 'bg-emerald-500' : 'bg-white/15'} disabled:opacity-50`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${autoSync.enabled ? 'left-6' : 'left-1'}`} />
              {(autoSync.loading || saving) && <Loader2 className="absolute left-4 top-1.5 h-4 w-4 animate-spin text-black" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
