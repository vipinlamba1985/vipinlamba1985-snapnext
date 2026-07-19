'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, ScanFace, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const AUTO_WARM_KEY = 'snapnext.peopleV3AutoWarm.v1';

export default function PeopleMagicBootstrap() {
  const [state, setState] = useState({ loading: true, people: [], engineReady: false, migration: null });
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch('/magic-library/people'),
      apiFetch('/magic-library/people/reindex').catch(() => null),
    ]).then(([peopleResult, migration]) => {
      if (!cancelled) setState({ loading: false, people: peopleResult.people || [], engineReady: Boolean(peopleResult.engineReady), migration });
    }).catch(() => {
      if (!cancelled) setState({ loading: false, people: [], engineReady: false, migration: null });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state.loading || building || !state.engineReady || state.people.length > 0 || !state.migration?.needsMigration) return;
    let alreadyStarted = false;
    try {
      alreadyStarted = sessionStorage.getItem(AUTO_WARM_KEY) === '1';
      if (!alreadyStarted) sessionStorage.setItem(AUTO_WARM_KEY, '1');
    } catch {}
    if (!alreadyStarted) runMigration({ automatic: true, maxBatches: 3 });
  // runMigration is intentionally triggered only when the initial status snapshot changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.engineReady, state.people.length, state.migration?.needsMigration]);

  async function runMigration({ automatic = false, maxBatches = 12 } = {}) {
    if (!state.engineReady || building) {
      if (!automatic) toast.error('People Intelligence needs AWS Rekognition permission before it can scan your library.');
      return;
    }

    setBuilding(true);
    let totalProcessed = 0;
    let totalFaces = 0;
    let remaining = Number(state.migration?.remaining || 1);
    let failed = Number(state.migration?.failed || 0);
    let latestMigration = state.migration;

    try {
      for (let batch = 0; batch < maxBatches && (remaining > 0 || failed > 0); batch += 1) {
        const result = await apiFetch('/magic-library/people/reindex', {
          method: 'POST',
          body: JSON.stringify({ limit: 12, retryFailed: batch === 0 && failed > 0 }),
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

      const peopleResult = await apiFetch('/magic-library/people');
      const people = peopleResult.people || [];
      setState((current) => ({ ...current, people, engineReady: Boolean(peopleResult.engineReady), migration: latestMigration }));

      if (people.length > 0) {
        if (!automatic) toast.success(`People thumbnails restored with ${people.length} clean ${people.length === 1 ? 'person' : 'people'}.`);
        window.location.reload();
        return;
      }

      if (!automatic) {
        if (remaining || failed) toast.message('The clean People rebuild is saved. Continue the upgrade to restore thumbnails.');
        else toast.message('No clear face met the new quality rules yet.');
      }
    } catch (error) {
      if (!automatic) toast.error(error?.message || 'Could not rebuild People Magic');
    } finally {
      setBuilding(false);
    }
  }

  if (state.loading) return null;
  const migrationNeeded = Boolean(state.migration?.needsMigration);
  if (state.people.length > 0 && !migrationNeeded) return null;

  const existing = state.people.length > 0;
  const migration = progress || state.migration;
  const done = Number(migration?.completed || 0);
  const total = Number(migration?.total || 0);
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const emptyDuringMigration = !existing && migrationNeeded;

  return (
    <section className="mb-5 rounded-3xl border border-pink-400/20 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pink-500/15 text-pink-200">{building ? <Loader2 className="h-6 w-6 animate-spin" /> : existing ? <RefreshCw className="h-6 w-6" /> : <ScanFace className="h-6 w-6" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h2 className="text-lg font-black text-white">{emptyDuringMigration ? 'Restoring your People thumbnails' : existing ? 'Upgrade your People Library' : 'Build your People Magic'}</h2><Sparkles className="h-4 w-4 text-pink-300" /></div>
          <p className="mt-1 text-sm leading-6 text-white/50">{emptyDuringMigration ? 'SnapNext is rebuilding clean face groups from your original photos. The first clear thumbnails start appearing automatically; your photos and saved names remain safe.' : existing ? 'SnapNext is safely migrating your existing library to the improved person-matching engine in small resumable batches.' : 'SnapNext will find real faces, group the same person together, reject screenshots and documents, and choose a clear face for each thumbnail.'}</p>
          {total > 0 && <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs font-bold text-pink-100/70">{done} of {total} photos ready · {Number(migration?.remaining || 0)} waiting{Number(migration?.failed || 0) ? ` · ${migration.failed} will retry` : ''}</p></div>}
          {progress && <p className="mt-2 text-xs text-white/45">This session checked {progress.processed} photos and found {progress.faces} clear faces.</p>}
          {!state.engineReady && <p className="mt-2 text-xs text-amber-200/75">The face engine is not available in this environment yet.</p>}
          <button onClick={() => runMigration()} disabled={building || !state.engineReady} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{building ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{building ? 'Restoring clean faces…' : 'Continue restoring thumbnails'}</button>
        </div>
      </div>
    </section>
  );
}
