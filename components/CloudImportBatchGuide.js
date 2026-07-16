'use client';

import { CheckCircle2, Layers3 } from 'lucide-react';

export default function CloudImportBatchGuide({ selected = 0, batchSize = 10, maxFiles = 500, progress = null }) {
  const totalBatches = Math.max(1, Math.ceil((progress?.total || selected || 1) / batchSize));
  const currentBatch = progress ? Math.min(totalBatches, Math.floor(progress.completed / batchSize) + (progress.completed < progress.total ? 1 : 0)) : 0;

  return (
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
  );
}
