'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ScanFace, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { publishLibraryRefresh } from '@/lib/library-refresh';
import {
  AUTOMATIC_BATCH_DELAY_MS,
  MAX_AUTOMATIC_BATCHES,
  automaticContinuationExhausted,
  describeMigration,
  shouldContinueAutomaticBatch,
  shouldStartAutomaticPass,
} from '@/lib/people-migration-policy';
import { toast } from 'sonner';

const EMPTY_STATE = {
  loading: true,
  people: [],
  engineReady: false,
  migration: null,
  selfRepairRequired: false,
  selfRepairClusterId: null,
};

export default function PeopleMagicBootstrap() {
  const [state, setState] = useState(EMPTY_STATE);
  const [building, setBuilding] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [progress, setProgress] = useState(null);
  // Once automatic mode stops making progress it stays off until the user acts.
  // Held in a ref so a re-render can never silently re-arm unattended work.
  const automaticExhausted = useRef(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchState = useCallback(async () => {
    const [peopleResult, migration] = await Promise.all([
      apiFetch('/magic-library/people'),
      apiFetch('/magic-library/people/reindex').catch(() => null),
    ]);
    return {
      loading: false,
      people: peopleResult.people || [],
      engineReady: Boolean(peopleResult.engineReady),
      migration,
      selfRepairRequired: Boolean(peopleResult.selfRepairRequired),
      selfRepairClusterId: peopleResult.selfRepairClusterId || null,
    };
  }, []);

  const refreshState = useCallback(async () => {
    const next = await fetchState();
    if (mountedRef.current) setState(next);
    return next;
  }, [fetchState]);

  useEffect(() => {
    let cancelled = false;
    fetchState()
      .then((next) => { if (!cancelled) setState(next); })
      .catch(() => { if (!cancelled) setState({ ...EMPTY_STATE, loading: false }); });
    return () => { cancelled = true; };
  }, [fetchState]);

  const runMigration = useCallback(async ({ automatic = false, retryFailed = false } = {}) => {
    if (runningRef.current) return;
    if (!state.engineReady) {
      if (!automatic) toast.error('People Intelligence needs AWS Rekognition permission before it can scan your library.');
      return;
    }

    runningRef.current = true;
    setBuilding(true);
    if (!automatic) {
      setAutoPaused(false);
      automaticExhausted.current = false;
    }

    let totalProcessed = 0;
    let totalFaces = 0;
    let remaining = Number(state.migration?.remaining || 0);
    let lastBatchProcessed = null;

    try {
      for (let batch = 0; shouldContinueAutomaticBatch({
        batchIndex: batch,
        maxBatches: automatic ? MAX_AUTOMATIC_BATCHES : 12,
        remaining,
        lastBatchProcessed,
      }); batch += 1) {
        const result = await apiFetch('/magic-library/people/reindex', {
          method: 'POST',
          // Failed items are only ever re-queued by an explicit user retry.
          body: JSON.stringify({ limit: 12, retryFailed: retryFailed && batch === 0 }),
        });
        lastBatchProcessed = Number(result.processed || 0);
        totalProcessed += lastBatchProcessed;
        totalFaces += Number(result.faces || 0);
        const snapshot = result.migration || null;
        remaining = Number(snapshot?.remaining ?? result.remaining ?? 0);
        if (mountedRef.current) {
          setProgress({
            processed: totalProcessed,
            faces: totalFaces,
            remaining,
            failed: Number(snapshot?.failed || 0),
            completed: Number(snapshot?.completed || 0),
            total: Number(snapshot?.total || 0),
          });
        }
      }

      const next = await refreshState();
      const view = describeMigration(next.migration);

      if (automaticContinuationExhausted({ totalProcessed, remaining: view.remaining })) {
        automaticExhausted.current = true;
      }

      // Photos finished this pass are usable now — let data owners re-read in
      // place rather than reloading the page.
      if (totalProcessed > 0) publishLibraryRefresh({ source: 'people-migration' });

      if (!automatic) {
        if (view.complete) {
          toast.success(view.needsAttention
            ? 'People organizing finished. A few photos still need your attention.'
            : 'Your full photo history is organized by person.');
        } else {
          toast.message('Your People backfill is saved. SnapNext will continue from where it stopped.');
        }
      }
    } catch (error) {
      // A failed pass never re-arms itself; the user decides when to try again.
      automaticExhausted.current = true;
      if (mountedRef.current) setAutoPaused(true);
      if (!automatic) toast.error(error?.message || 'Could not rebuild People Magic');
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setBuilding(false);
    }
  }, [state.engineReady, state.migration, refreshState]);

  // Identity self-repair: single attempt, no reload, no automatic re-entry.
  useEffect(() => {
    if (state.loading || building || repairing || autoPaused) return;
    if (!state.engineReady || !state.selfRepairRequired || !state.selfRepairClusterId) return;

    let cancelled = false;
    setRepairing(true);
    apiFetch('/magic-library/people/recover', {
      method: 'POST',
      body: JSON.stringify({ clusterId: state.selfRepairClusterId, action: 'self' }),
    })
      .then(async () => {
        if (cancelled) return;
        await refreshState();
        publishLibraryRefresh({ source: 'people-self-repair' });
      })
      .catch((error) => {
        if (cancelled) return;
        setAutoPaused(true);
        toast.error(error?.message || 'Could not reconnect your older People identity');
      })
      .finally(() => { if (!cancelled) setRepairing(false); });

    return () => { cancelled = true; };
  }, [state.loading, state.engineReady, state.selfRepairRequired, state.selfRepairClusterId, building, repairing, autoPaused, refreshState]);

  // Automatic backfill: only ever targets queued remaining work.
  useEffect(() => {
    if (!shouldStartAutomaticPass({
      loading: state.loading,
      engineReady: state.engineReady,
      building,
      repairing,
      paused: autoPaused,
      needsMigration: Boolean(state.migration?.needsMigration),
      selfRepairRequired: state.selfRepairRequired,
      remaining: state.migration?.remaining,
      exhausted: automaticExhausted.current,
    })) return;

    const timer = window.setTimeout(() => runMigration({ automatic: true }), AUTOMATIC_BATCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    state.loading,
    state.engineReady,
    state.selfRepairRequired,
    state.migration?.needsMigration,
    state.migration?.remaining,
    building,
    repairing,
    autoPaused,
    runMigration,
  ]);

  if (state.loading) return null;

  const view = describeMigration(progress || state.migration);
  const migrationNeeded = Boolean(state.migration?.needsMigration || state.selfRepairRequired);
  if (!migrationNeeded) return null;

  const working = building || repairing;
  const finishedWithAttention = view.complete && view.needsAttention;

  return (
    <section className="mb-5 rounded-3xl border border-pink-400/20 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pink-500/15 text-pink-200">
          {working ? <Loader2 className="h-6 w-6 animate-spin" /> : finishedWithAttention ? <AlertCircle className="h-6 w-6 text-amber-200" /> : view.complete ? <CheckCircle2 className="h-6 w-6 text-emerald-200" /> : state.people.length ? <RefreshCw className="h-6 w-6" /> : <ScanFace className="h-6 w-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white">{view.complete ? (view.needsAttention ? 'Photo organization finished' : 'Your photo history is organized') : 'Organizing your full photo history'}</h2>
            <Sparkles className="h-4 w-4 text-pink-300" />
          </div>
          <p className="mt-1 text-sm leading-6 text-white/50">SnapNext is checking older photos that were saved before People recognition was fully available and attaching every matched photo to the correct person. Originals stay unchanged.</p>
          {state.selfRepairRequired && <p className="mt-2 text-xs font-bold text-emerald-200/80">Reconnecting your saved “You” face to the current People identity…</p>}

          {view.total > 0 && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all" style={{ width: `${view.percent}%` }} />
              </div>
              <p className="mt-2 text-xs font-bold text-pink-100/70" role="status">
                {view.completed} of {view.total} photos organized
                {view.remaining ? ` · ${view.remaining} waiting` : ''}
                {view.needsAttention ? ` · ${view.failed} need attention` : ''}
              </p>
            </div>
          )}

          {progress && <p className="mt-2 text-xs text-white/45">This pass checked {progress.processed} photos and found {progress.faces} clear faces.</p>}
          {!state.engineReady && <p className="mt-2 text-xs text-amber-200/75">The face engine is not available in this environment yet.</p>}
          {autoPaused && <p className="mt-2 text-xs text-amber-200/75">Automatic organizing paused after an error. Your progress is saved.</p>}
          {finishedWithAttention && <p className="mt-2 text-xs text-amber-200/75">Your original photos are safe. Only People organization needs attention.</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {!view.complete && (
              <button
                onClick={() => runMigration()}
                disabled={working || !state.engineReady}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {working ? 'Organizing photos…' : 'Finish organizing all photos'}
              </button>
            )}
            {view.needsAttention && (
              <button
                onClick={() => runMigration({ retryFailed: true })}
                disabled={working || !state.engineReady}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCw className="h-4 w-4" />
                Retry {view.failed} photo{view.failed === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
