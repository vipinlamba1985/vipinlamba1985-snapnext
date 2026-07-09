'use client';

import { useEffect, useState } from 'react';
import { Loader2, ScanFace, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

export default function PeopleMagicBootstrap() {
  const [state, setState] = useState({ loading: true, people: [], engineReady: false });
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/magic-library/people')
      .then((result) => { if (!cancelled) setState({ loading: false, people: result.people || [], engineReady: Boolean(result.engineReady) }); })
      .catch(() => { if (!cancelled) setState({ loading: false, people: [], engineReady: false }); });
    return () => { cancelled = true; };
  }, []);

  if (state.loading || state.people.length > 0) return null;

  async function buildPeopleMagic() {
    if (!state.engineReady) {
      toast.error('People Intelligence needs AWS Rekognition permission before it can scan faces.');
      return;
    }

    setBuilding(true);
    let totalProcessed = 0;
    let totalFaces = 0;
    let remaining = 1;
    try {
      for (let batch = 0; batch < 8 && remaining > 0; batch += 1) {
        const result = await apiFetch('/magic-library/people/reindex', {
          method: 'POST',
          body: JSON.stringify({ limit: 12 }),
        });
        totalProcessed += Number(result.processed || 0);
        totalFaces += Number(result.faces || 0);
        remaining = Number(result.remaining || 0);
        setProgress({ processed: totalProcessed, faces: totalFaces, remaining });
        if (!result.processed) break;
      }
      toast.success(totalFaces ? `SnapNext found ${totalFaces} face${totalFaces === 1 ? '' : 's'}.` : 'People scan completed.');
      window.location.reload();
    } catch (error) {
      toast.error(error?.message || 'Could not build People Magic');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <section className="mb-5 rounded-3xl border border-pink-400/20 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pink-500/15 text-pink-200"><ScanFace className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h2 className="text-lg font-black text-white">Build your People Magic</h2><Sparkles className="h-4 w-4 text-pink-300" /></div>
          <p className="mt-1 text-sm leading-6 text-white/50">SnapNext will find real faces in your personal photos, group the same person together, reject screenshots and documents, and choose a clear face for each round thumbnail.</p>
          {progress && <p className="mt-2 text-xs font-bold text-pink-100/70">{progress.processed} photos checked · {progress.faces} faces found{progress.remaining ? ` · ${progress.remaining} still waiting` : ''}</p>}
          {!state.engineReady && <p className="mt-2 text-xs text-amber-200/75">The face engine is not available in this environment yet.</p>}
          <button onClick={buildPeopleMagic} disabled={building || !state.engineReady} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{building ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}{building ? 'Finding your people…' : 'Build People Magic'}</button>
        </div>
      </div>
    </section>
  );
}
