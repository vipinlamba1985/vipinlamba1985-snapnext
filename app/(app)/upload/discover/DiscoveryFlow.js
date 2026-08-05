'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CloudDownload,
  Film,
  Images,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { classifyLocalFile } from '@/lib/discovery-classify';
import useDiscoveryFlow from '@/components/protection/useDiscoveryFlow';
import ProtectionStages from './ProtectionStages';

export default function DiscoveryFlow() {
  const inputRef = useRef(null);
  const flow = useDiscoveryFlow();

  useEffect(() => {
    if (flow.stage !== 'protecting') return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flow.stage]);

  async function chooseFiles(files) {
    const items = files
      .filter((file) => file.type?.startsWith('image/') || file.type?.startsWith('video/'))
      .map(classifyLocalFile);
    if (!items.length) {
      flow.setError('Choose at least one supported photo or video.');
      return;
    }
    await flow.checkItems(items);
  }

  async function startProtection() {
    let handoff = null;
    try {
      flow.setError('');
      flow.setProtecting(true);
      flow.setStage('protecting');
      handoff = flow.handoffPreparedReservations(flow.decisions);
      const { runProtectionQueue } = await import('@/lib/protection-run');
      const counts = await runProtectionQueue(flow.plan.selected, flow.decisions, flow.updateQueue);
      const duplicateAssignments = await flow.confirmDuplicateAssignments(flow.decisions);
      if (duplicateAssignments.failed) {
        flow.setError('Backup finished, but some existing duplicates could not be added to the selected person.');
      }
      flow.setSummary(counts);
      flow.setProtecting(false);
      flow.setStage('results');
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('snapnext:library-refresh'));
    } catch (error) {
      flow.setProtecting(false);
      flow.setError(error?.message || 'SnapNext could not start this backup. Please try again.');
      flow.setStage('review');
    } finally {
      if (handoff) await flow.finalizeProtection(handoff).catch(() => null);
    }
  }

  if (flow.stage === 'protecting' || flow.stage === 'results') {
    return <ProtectionStages flow={flow} />;
  }

  if (flow.stage === 'welcome') {
    const personPending = Boolean(flow.requestedPersonId && flow.peopleBusy);
    return (
      <div className="mx-auto max-w-5xl pb-36 md:pb-12">
        <section className="rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-600/10 to-cyan-500/10 p-6 text-center md:p-12">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/10 text-pink-200">
            <Images className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white md:text-6xl">Back up your memories</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/60">
            Choose photos and videos. SnapNext checks them automatically, then shows one clear review before anything uploads.
          </p>

          {flow.uploadPeople.length > 0 && (
            <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-pink-400/20 bg-pink-400/10 px-4 py-3 text-sm text-pink-100">
              New memories will be added to {flow.uploadPeople.map((person) => person.label).join(' and ')} after you confirm the backup.
            </div>
          )}

          <button
            onClick={() => inputRef.current?.click()}
            disabled={personPending}
            className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white disabled:opacity-40"
          >
            {personPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Images className="h-5 w-5" />}
            {personPending ? 'Preparing person upload…' : 'Choose photos and videos'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(event) => {
              void chooseFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
            className="hidden"
          />

          <div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            <LockKeyhole className="h-4 w-4 shrink-0" /> Nothing uploads until you press Back up.
          </div>

          {flow.error && (
            <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {flow.error}
            </div>
          )}

          <div data-testid="upload-cloud-sync" className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 sm:flex-row sm:text-left">
            <CloudDownload className="h-5 w-5 shrink-0 text-cyan-200" />
            <p className="flex-1 text-sm leading-6 text-white/55">
              Already stored in a cloud? Import selected files from Google Drive, Google Photos, Dropbox or OneDrive. SnapNext does not change the originals.
            </p>
            <Link data-testid="upload-cloud-sync-link" href="/imports" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] px-5 py-2.5 text-sm font-black text-white">
              Import from Cloud
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (flow.stage === 'checking') {
    const percent = flow.hashProgress.total
      ? Math.round((flow.hashProgress.done / flow.hashProgress.total) * 100)
      : 0;
    return (
      <div className="mx-auto max-w-4xl pb-36 md:pb-12">
        <section className="rounded-[2.5rem] border border-white/10 bg-white/[0.035] p-7 text-center md:p-12">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-pink-300" />
          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-pink-200/70">Automatic check</p>
          <h1 className="mt-2 text-3xl font-black text-white md:text-5xl">Checking your memories</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
            SnapNext is checking duplicates, file safety and available storage. No photo or video bytes are uploading.
          </p>
          <div className="mx-auto mt-7 h-2 max-w-xl overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-pink-500 to-purple-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-3 text-sm text-white/45">
            Checking {flow.hashProgress.done} of {flow.hashProgress.total} memories…
          </p>
        </section>
      </div>
    );
  }

  const readyCount = flow.decisionSummary.ready;
  const duplicateCount = flow.decisionSummary.duplicates;
  const notReadyCount = flow.decisionSummary.noSpace
    + flow.decisionSummary.unsupported
    + flow.decisionSummary.tooLarge
    + flow.decisionSummary.directRequired;
  const selectedLabel = flow.report.total === 1 ? 'memory' : 'memories';
  const readyLabel = readyCount === 1 ? 'memory' : 'memories';
  const duplicateActionCount = flow.uploadPeople.length ? duplicateCount : 0;
  const canConfirm = readyCount > 0 || duplicateActionCount > 0;
  const primaryLabel = readyCount > 0
    ? `Back up ${readyCount} ${readyLabel}`
    : `Add ${duplicateActionCount} existing ${duplicateActionCount === 1 ? 'memory' : 'memories'}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-36 md:pb-12">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-7 w-7 shrink-0 text-emerald-200" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-100/60">Checked and ready</p>
            <h1 className="mt-2 text-3xl font-black text-white md:text-5xl">
              {flow.report.total} {selectedLabel} selected
            </h1>
            <p className="mt-3 text-sm text-white/50">
              {formatBytes(flow.report.bytes)} · These totals come from SnapNext’s real server checks.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard icon={CheckCircle2} label="Ready" value={readyCount} />
          <SummaryCard icon={RefreshCcw} label="Duplicates" value={duplicateCount} />
          <SummaryCard icon={ImageIcon} label="Photos" value={flow.report.photos} />
          <SummaryCard icon={Film} label="Videos" value={flow.report.videos} />
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-white/40">Upload summary</div>
              <div className="mt-2 text-xl font-black text-white">
                {readyCount > 0 ? `${readyCount} ${readyLabel} ready · ${formatBytes(flow.decisionSummary.approvedBytes)}` : 'No new files are ready'}
              </div>
              {notReadyCount > 0 && (
                <p className="mt-1 text-sm text-amber-200">
                  {notReadyCount} {notReadyCount === 1 ? 'item will' : 'items will'} not upload. See the reasons below.
                </p>
              )}
              {duplicateCount > 0 && (
                <p className="mt-1 text-sm text-white/45">{duplicateCount} already {duplicateCount === 1 ? 'exists' : 'exist'} in your Library.</p>
              )}
            </div>
            <div className="text-sm font-bold text-white/45 sm:text-right">
              {flow.unlimitedStorage
                ? 'Unlimited storage available'
                : flow.availableBytes !== null
                  ? `${formatBytes(flow.availableBytes)} available before this backup`
                  : 'Storage checked'}
            </div>
          </div>
        </div>

        {notReadyCount > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {flow.decisionSummary.noSpace > 0 && <ReasonRow label="Storage full" count={flow.decisionSummary.noSpace} />}
            {flow.decisionSummary.unsupported > 0 && <ReasonRow label="Unsupported" count={flow.decisionSummary.unsupported} />}
            {flow.decisionSummary.tooLarge > 0 && <ReasonRow label="Too large for this method" count={flow.decisionSummary.tooLarge} />}
            {flow.decisionSummary.directRequired > 0 && <ReasonRow label="Direct storage unavailable" count={flow.decisionSummary.directRequired} />}
          </div>
        )}

        {flow.uploadPeople.length > 0 && (
          <div className="mt-5 rounded-2xl border border-pink-400/20 bg-pink-400/10 p-4 text-sm leading-6 text-pink-100">
            After you confirm, these memories will also appear under {flow.uploadPeople.map((person) => person.label).join(' and ')}. This is your organization choice and does not train face recognition.
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          {canConfirm
            ? 'Nothing has uploaded yet. Press the single button below to begin.'
            : 'Everything selected is already in your Library, or cannot be uploaded with the current method.'}
        </div>

        {flow.error && <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{flow.error}</div>}

        <div className="mt-7 flex flex-wrap gap-3">
          {canConfirm ? (
            <button
              onClick={startProtection}
              disabled={flow.protecting}
              className="inline-flex min-h-14 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white disabled:opacity-40"
            >
              {primaryLabel} <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/gallery" className="inline-flex min-h-14 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white">
              <Images className="h-5 w-5" /> View in Library
            </Link>
          )}
          <button onClick={() => { void flow.resetFlow(); }} className="min-h-14 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/65">
            Choose different files
          </button>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <Icon className="h-5 w-5 text-pink-200" />
      <div className="mt-3 text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-white/45">{label}</div>
    </div>
  );
}

function ReasonRow({ label, count }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm">
      <span className="text-white/55">{label}</span>
      <span className="font-black text-white">{count}</span>
    </div>
  );
}
