'use client';

import { useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

const SESSION_KEY = 'snapnext.aiEnrichmentRecovery.v1';

export default function AiEnrichmentRecovery() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {}

    let cancelled = false;
    async function run() {
      try {
        const result = await apiFetch('/media/enrichment', { method: 'POST' });
        if (!cancelled && (result?.processed || 0) >= 2) setTimeout(run, 2500);
      } catch {}
    }

    const timer = setTimeout(run, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return null;
}
