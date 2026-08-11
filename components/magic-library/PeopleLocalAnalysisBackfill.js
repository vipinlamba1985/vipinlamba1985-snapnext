'use client';

import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { analyzeStoredWebPhoto } from '@/lib/intelligence/web-face-analysis';
import { publishLibraryRefresh } from '@/lib/library-refresh';

const BACKFILL_PAGE_SIZE = 6;
const BACKFILL_MAX_PER_VISIT = 18;

/**
 * Bounded web producer for photos that arrived before local Magic Sorter data
 * existed. A stable cursor lets one visit advance beyond a bad first page, while
 * per-media retryAt backoff prevents repeated failures from starving the queue.
 * New uploads are analyzed in the upload path; this remains finite catch-up.
 */
export default function PeopleLocalAnalysisBackfill() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    (async () => {
      let cursor = '';
      let attempted = 0;
      let completed = 0;

      while (!cancelled && attempted < BACKFILL_MAX_PER_VISIT) {
        const remaining = BACKFILL_MAX_PER_VISIT - attempted;
        const limit = Math.min(BACKFILL_PAGE_SIZE, remaining);
        const query = new URLSearchParams({ limit: String(limit) });
        if (cursor) query.set('cursor', cursor);
        const batch = await apiFetch(`/media/analysis/backfill?${query}`);
        if (!batch?.enabled || !(batch.items || []).length) break;

        for (const item of batch.items || []) {
          if (cancelled || attempted >= BACKFILL_MAX_PER_VISIT) break;
          attempted += 1;
          try {
            const analysis = await analyzeStoredWebPhoto(item.id);
            if (analysis) completed += 1;
          } catch {
            // analyzeStoredWebPhoto records bounded retry backoff. The media
            // remains awaiting_analysis and the cursor advances past it.
          }
        }

        cursor = String(batch.nextCursor || '');
        if (!cursor) break;
      }

      if (!cancelled && completed > 0) {
        publishLibraryRefresh({ source: 'web-local-face-backfill' });
      }
    })().catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return null;
}
