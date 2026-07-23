'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, ScanFace, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

export default function PeopleMagicBootstrap() {
  const [state, setState] = useState({
    loading: true,
    people: [],
    engineReady: false,
    migration: null,
    selfRepairRequired: false,
    selfRepairClusterId: null,
  });
  const [building, setBuilding] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [progress, setProgress] = useState(null);

  async function refreshState() {
    const [peopleResult, migration] = await Promise.all([
      apiFetch('/magic-library/people'),
      apiFetch('/magic-library/people/reindex').catch(() => null),
    ]);
    const next = {
      loading: false,
      people: peopleResult.people || [],
      engineReady: Boolean(peopleResult.engineReady),
      migration,
      selfRepairRequired: Boolean(peopleResult.selfRepairRequired),
      selfRepairClusterId: peopleResult.selfRepairClusterId || null,
    };
    setState(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch('/magic-library/people'),
      apiFetch('/magic-library/people/reindex').catch(() => null),
    ]).then(([peopleResult, migration]) => {
      if (cancelled) return;
      setState({
        loading: false,
        people: peopleResult.people || [],
        engineReady: Boolean(peopleResult.engineReady),
        migration,
        selfRepairRequired: Boolean(peopleResult.selfRepairRequired),
        selfRepairClusterId: peopleResult.selfRepairClusterId || null,
      });
    }).catch(() => {
      if (!cancelled) setState({ loading: false, people: [], engineReady: false, migration: null, selfRepairRequired: false, selfRepairClusterId: null });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state.loading || building || repairing || autoPaused || !state.engineReady || !state.selfRepairRequired || !state.selfRepairClusterId) return;
    let cancelled = false;
    setRepairing(true);
    apiFetch('/magic-library/people/recover', {
      method: 'POST',
      body: JSON.stringify({ clusterId: state.selfRepairClusterId, action: 'self' }),
    }).then(async () => {
      if (cancelled) return;
      await refreshState();
    }).catch((error) => {
      if (!cancelled) {
        setAutoPaused(true);
        toast.error(error?.message || 'Could not reconnect your older People identity');
      }
    }).finally(() => { if (!cancelled) setRepairing(false); });
    return () => { cancelled = true; };
  // refreshState is intentionally invoked only when identity-repair state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.engineReady, state.selfRepairRequired, state.selfRepairClusterId, building, repairing, autoPaused]);

  useEffect(() => {
    const remaining = Number(state.migration?.remaining || 0);
    if (state.loading || building || repairing || autoPaused || !state.engineReady || state.selfRepairRequired || !state.migration?.needsMigration || remaining <= 0) return;
    const timer = window.setTimeout(() => runMigration({ automatic: true, maxBatches: 6 }), 700);
    return () => window.clearTimeout(timer);
  // runMigration is intentionally driven by the latest saved migration snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.engineReady, state.selfRepairRequired, state.migration?.needsMigration, state.migration?.remaining, building, repairing, autoPaused]);

  async function runMigration({ automatic = false, maxBatches = 12 } = {}) {
    if (!state.engineReady || building || repairing) {
      if (!automatic) toast.error('People Intelligence needs AWS Rekognition permission before it can scan your library.');
      return;
    }

    setBuilding(true);
    if (!automatic) setAutoPaused(false);
    let totalProcessed = 0;
    let totalFaces = 0;
    let remaining = Number(state.migration?.remaining || 0);
    let failed = Number(state.migration?.failed || 0);
    let latestMigration = state.migration;

    try {
      const shouldContinue = () => automatic ? remaining > 0 : (remaining > 0 || failed > 0);
      for (let batch = 0; batch < maxBatches && shouldContinue(); batch += 1) {
        const result = await apiFetch('/magic-library/people/reindex', {
          method: 'POST',
          body: JSON.stringify({ limit: 12, retryFailed: !automatic && batch === 0 && failed > 0 }),
        });
        totalProcessed += Number(result.processed || 0);
        totalFaces += Number(result.faces || 0);
        latestMigration = result.migration || latestMigration;
        remaining = Number(latestMigration?.remaining ?? result.remaining ?? 0);
        failed = Number(latestMigration?.failed || 0);
        setProgress({
          processed: totalProcessed,
          faces: totalFaces,
          remaining,
          failed,
          completed: Number(latestMigration?.completed || 0),
          total: Number(latestMigration?.total || 0),
        });
        if (!result.processed) break;
      }

      const next = await refreshState();
      remaining = Number(next.migration?.remaining || 0);
      failed = Number(next.migration?.failed || 0);

      if (automatic) {
        if (!next.selfRepairRequired && remaining === 0) {
          window.location.reload();
          return;
        }
        if (remaining === 0 && failed > 0) setAutoPaused(true);
        return;
      }

      if (remaining === 0 && !next.selfRepairRequired) {
        toast.success('Your full photo history is organized by person.');
        window.location.reload();
      } else if (remaining || failed || next.selfRepairRequired) {
        toast.message('Your People backfill is saved. SnapNext will continue from where it stopped.');
      }
    } catch (error) {
      setAutoPaused(true);
      if (!automatic) toast.error(error?.message || 'Could not rebuild People Magic');
    } finally {
      setBuilding(false);
    }
  }

  if (state.loading) return null;
  const migrationNeeded = Boolean(state.migration?.needsMigration || state.selfRepairRequired);
  if (!migrationNeeded) return null;

  const migration = progress || state.migration;
  const done = Number(migration?.completed || 0);
  const total = Number(migration?.total || 0);
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const working = building || repairing;

  return (
    <section className="mb-5 rounded-3xl border border-pink-400/20 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pink-500/15 text-pink-200">{working ? <Loader2 className="h-6 w-6 animate-spin" /> : state.people.length ? <RefreshCw className="h-6 w-6" /> : <ScanFace className="h-6 w-6" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h2 className="text-lg font-black text-white">Organizing your full photo history</h2><Sparkles className="h-4 w-4 text-pink-300" /></div>
          <p className="mt-1 text-sm leading-6 text-white/50">SnapNext is checking older photos that were saved before People recognition was fully available and attaching every matched photo to the correct person. Originals stay unchanged.</p>
          {state.selfRepairRequired && <p className="mt-2 text-xs font-bold text-emerald-200/80">Reconnecting your saved “You” face to the current People identity…</p>}
          {total > 0 && <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs font-bold text-pink-100/70">{done} of {total} photos checked · {Number(migration?.remaining || 0)} waiting{Number(migration?.failed || 0) ? ` · ${migration.failed} need retry` : ''}</p></div>}
          {progress && <p className="mt-2 text-xs text-white/45">This pass checked {progress.processed} photos and found {progress.faces} clear faces.</p>}
          {!state.engineReady && <p className="mt-2 text-xs text-amber-200/75">The face engine is not available in this environment yet.</p>}
          {autoPaused && <p className="mt-2 text-xs text-amber-200/75">Automatic organizing paused after an error. Your progress is saved.</p>}
          <button onClick={() => runMigration()} disabled={working || !state.engineReady} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{working ? 'Organizing photos…' : 'Finish organizing all photos'}</button>
        </div>
      </div>
    </section>
  );
}
