'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CloudDownload,
  Film,
  Images,
  Image as ImageIcon,
  LockKeyhole,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { classifyLocalFile } from '@/lib/discovery-classify';
import useDiscoveryFlow from '@/components/protection/useDiscoveryFlow';
import PeopleFaceThumbnail from '@/components/magic-library/PeopleFaceThumbnail';
import ProtectionStages from './ProtectionStages';

export default function DiscoveryFlow() {
  const inputRef = useRef(null);
  const flow = useDiscoveryFlow();

  function chooseFiles(files) {
    const items = files
      .filter((file) => file.type?.startsWith('image/') || file.type?.startsWith('video/'))
      .map(classifyLocalFile);
    if (!items.length) return;
    flow.setItems(items);
    flow.setError('');
    flow.setStage('review');
  }

  async function startProtection() {
    try {
      flow.setStage('protecting');
      const decisions = await flow.prepareProtection();
      const { runProtectionQueue } = await import('@/lib/protection-run');
      const counts = await runProtectionQueue(flow.plan.selected, decisions, flow.updateQueue);
      flow.setSummary(counts);
      flow.setProtecting(false);
      flow.setStage('results');
    } catch (error) {
      flow.setProtecting(false);
      flow.setError(error?.message || 'SnapNext could not prepare this upload. Please try again.');
      flow.setStage('review');
    }
  }

  if (flow.stage === 'protecting' || flow.stage === 'results') {
    return <ProtectionStages flow={flow} />;
  }

  if (flow.stage === 'welcome') {
    return (
      <div className="mx-auto max-w-5xl pb-36 md:pb-12">
        <section className="rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-600/10 to-cyan-500/10 p-6 text-center md:p-12">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/10 text-pink-200">
            <Images className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white md:text-6xl">Back up your memories</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/60">
            Choose photos and videos, review one clear summary, and back them up.
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white"
          >
            <Images className="h-5 w-5" /> Choose photos and videos
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(event) => {
              chooseFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
            className="hidden"
          />
          <div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            <LockKeyhole className="h-4 w-4 shrink-0" /> Nothing uploads until you press the final Back up button.
          </div>

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

  const readyCount = flow.plan.selected.length;
  const outsideCount = flow.plan.outside.length;
  const selectedLabel = flow.report.total === 1 ? 'memory' : 'memories';
  const readyLabel = readyCount === 1 ? 'memory' : 'memories';
  const storageReady = flow.usage !== null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-36 md:pb-12">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-200/70">Ready to back up</p>
        <h1 className="mt-2 text-3xl font-black text-white md:text-5xl">
          {flow.report.total} {selectedLabel} selected
        </h1>
        <p className="mt-3 text-sm text-white/50">
          {formatBytes(flow.report.bytes)} · SnapNext checks duplicates, file safety and storage before any file is sent.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <SummaryCard icon={ImageIcon} label="Photos" value={flow.report.photos} />
          <SummaryCard icon={Film} label="Videos" value={flow.report.videos} />
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-white/40">Upload summary</div>
              <div className="mt-2 text-xl font-black text-white">
                {storageReady ? `${readyCount} ${readyLabel} ready` : 'Checking your storage…'}
              </div>
              {outsideCount > 0 && <p className="mt-1 text-sm text-amber-200">{outsideCount} will stay on your device because they do not fit.</p>}
            </div>
            <div className="text-right text-xs text-white/45">
              {flow.unlimitedStorage ? 'Unlimited storage available' : flow.availableBytes !== null ? `${formatBytes(flow.availableBytes)} available` : ''}
            </div>
          </div>
        </div>

        {!!flow.activePeople.length && (
          <section className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white">Add to people <span className="text-sm font-medium text-white/40">Optional</span></h2>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  This places every selected photo in those people’s memories. It is your organization choice and does not train face recognition.
                </p>
              </div>
              <span className="text-xs font-bold text-white/35">{flow.selectedPersonIds.length}/4</span>
            </div>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {flow.activePeople.map((person) => {
                const selected = flow.selectedPersonIds.includes(person.clusterId);
                return (
                  <button
                    key={person.clusterId}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => flow.togglePerson(person.clusterId)}
                    className={`w-24 shrink-0 rounded-2xl border p-2 text-center transition ${selected ? 'border-pink-400/60 bg-pink-500/15' : 'border-white/10 bg-white/[0.04]'}`}
                  >
                    <span className="relative mx-auto block h-20 w-16 overflow-hidden rounded-xl bg-white/5">
                      <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} className="h-full w-full" />
                      {selected && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-emerald-400 text-black"><UserCheck className="h-3.5 w-3.5" /></span>}
                    </span>
                    <span className="mt-2 block truncate text-xs font-black text-white">{person.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {flow.error && <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{flow.error}</div>}

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            onClick={startProtection}
            disabled={!storageReady || !readyCount || flow.protecting}
            className="inline-flex min-h-14 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 text-base font-black text-white disabled:opacity-40"
          >
            Back up {readyCount || ''} {readyCount ? readyLabel : ''} <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={flow.reset} className="min-h-14 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/65">
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
