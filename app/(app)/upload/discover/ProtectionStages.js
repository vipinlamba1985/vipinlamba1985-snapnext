'use client';

import Link from 'next/link';
import { CheckCircle2, Images, Loader2, Sparkles } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

export default function ProtectionStages({ flow }) {
  if (flow.stage === 'protecting') return <Protecting flow={flow} />;
  if (flow.stage === 'results') return <Results flow={flow} />;
  return null;
}

function Protecting({ flow }) {
  const finished = flow.queue.filter((row) => ['completed', 'duplicate', 'outside', 'skipped', 'failed'].includes(row.status)).length;
  const completed = flow.queue.filter((row) => row.status === 'completed').length;
  const total = flow.queue.length || flow.hashProgress.total;
  const percent = total ? Math.round((finished / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-36 md:pb-12">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
        <div className="flex items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-pink-300" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-200/60">Backup in progress</p>
            <h1 className="mt-1 text-3xl font-black text-white">Keep SnapNext open</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-white/50">
          SnapNext is checking duplicates, reserving space and uploading only approved files.
        </p>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-pink-500 to-purple-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-white/40">
          {flow.queue.length ? `${finished} of ${total} finished · ${completed} backed up` : `Preparing ${flow.hashProgress.done} of ${flow.hashProgress.total}`}
        </p>
      </section>

      {!!flow.queue.length && (
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="grid gap-2">
            {flow.queue.slice(0, 30).map((row) => (
              <div key={row.localId} className="rounded-2xl border border-white/10 bg-black/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-bold text-white">{row.name}</span>
                  <span className={`text-xs capitalize ${row.status === 'failed' ? 'text-rose-300' : 'text-white/45'}`}>{row.status}</span>
                </div>
                {row.status === 'uploading' && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${row.progress || 0}%` }} />
                  </div>
                )}
                {row.error && <p className="mt-2 text-xs leading-5 text-rose-200">{row.error}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Results({ flow }) {
  const protectedRows = flow.queue.filter((row) => row.status === 'completed');
  const failedRows = flow.queue.filter((row) => row.status === 'failed');
  const protectedBytes = protectedRows.reduce((sum, row) => sum + row.size, 0);
  const summary = flow.summary || { completed: 0, duplicate: 0, skipped: 0, failed: 0 };
  const notUploaded = Number(summary.skipped || 0) + flow.plan.outside.length;
  const firstPerson = flow.selectedPeople[0] || null;
  const personLink = firstPerson ? `/gallery/magic?person=${encodeURIComponent(firstPerson.clusterId)}` : '';

  return (
    <div className="mx-auto max-w-4xl pb-36 md:pb-12">
      <section className="rounded-[2.5rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-400/15 via-white/[0.03] to-purple-500/10 p-7 text-center md:p-12">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15 text-emerald-200">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-4xl font-black text-white">
          {summary.completed ? `${summary.completed} ${summary.completed === 1 ? 'memory is' : 'memories are'} backed up` : 'Backup finished'}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/55">
          Your originals were left untouched. New memories are available in Library now.
        </p>
        {!!flow.selectedPeople.length && summary.completed > 0 && (
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-pink-100">
            Added by you to {flow.selectedPeople.map((person) => person.label).join(' and ')}. This did not train face recognition.
          </p>
        )}

        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Backed up" value={summary.completed} />
          <Stat label="Duplicates" value={summary.duplicate} />
          <Stat label="Not uploaded" value={notUploaded} />
          <Stat label="Failed" value={summary.failed} />
        </div>
        <p className="mt-5 text-sm text-white/45">{formatBytes(protectedBytes)} newly backed up</p>

        {!!failedRows.length && (
          <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-left">
            <h2 className="text-sm font-black text-rose-100">Files that need attention</h2>
            <div className="mt-2 space-y-2">
              {failedRows.map((row) => (
                <div key={row.localId} className="rounded-xl bg-black/20 px-3 py-2">
                  <div className="truncate text-sm font-bold text-white">{row.name}</div>
                  <div className="mt-1 text-xs leading-5 text-rose-200">{row.error || 'Upload failed. Choose the file again and retry.'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/gallery" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white">
            <Images className="h-5 w-5" /> View in Library
          </Link>
          {personLink && summary.completed > 0 && (
            <Link href={personLink} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-7 py-4 text-base font-black text-white">
              <Sparkles className="h-5 w-5" /> View {firstPerson.label}
            </Link>
          )}
          <button onClick={flow.reset} className="min-h-14 rounded-full border border-white/10 bg-white/[0.05] px-7 py-4 text-base font-black text-white/70">
            Add more
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-[11px] text-white/40">{label}</div>
    </div>
  );
}
