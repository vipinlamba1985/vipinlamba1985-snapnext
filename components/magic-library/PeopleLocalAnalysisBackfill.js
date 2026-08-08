'use client';

import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { analyzeStoredWebPhoto } from '@/lib/intelligence/web-face-analysis';
import { publishLibraryRefresh } from '@/lib/library-refresh';

const BACKFILL_LIMIT = 6;

/**
 * Bounded web producer for photos that arrived before local Magic Sorter data
 * existed. It runs only while the user is in Magic Library, processes a small
 * batch, and leaves unsupported/failed images deferred for a later visit or a
 * native producer. No AWS call is made here.
 */
export default function PeopleLocalAnalysisBackfill() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    (async () => {
      const batch = await apiFetch(`/media/analysis/backfill?limit=${BACKFILL_LIMIT}`);
      let completed = 0;
      for (const item of batch.items || []) {
        if (cancelled) break;
        try {
          await analyzeStoredWebPhoto(item.id);
          completed += 1;
        } catch {
          // Fail closed: unsupported formats/browsers remain awaiting_analysis.
          // They are never converted to no_faces and never sent to AWS here.
        }
      }
      if (!cancelled && completed > 0) {
        publishLibraryRefresh({ source: 'web-local-face-backfill' });
      }
    })().catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return null;
}
