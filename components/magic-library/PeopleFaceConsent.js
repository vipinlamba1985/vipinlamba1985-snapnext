'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ShieldCheck, TriangleAlert } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

function Pill({ children }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white/55">{children}</span>;
}

export default function PeopleFaceConsent() {
  const [state, setState] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/settings/local-face-detection-consent'),
      apiFetch('/settings/face-processing-consent'),
    ]).then(([local, cloud]) => setState({ local, cloud })).catch(() => setState(null));
  }, []);

  if (!state) return null;
  const { local, cloud } = state;
  const deletionStatus = cloud.deletionStatus || 'none';
  const needsAttention = deletionStatus === 'failed';
  const activeDeletion = ['pending', 'processing', 'verifying'].includes(deletionStatus);
  const nothingToShow = !local.available && !cloud.available && !local.granted && !cloud.granted && !needsAttention && !activeDeletion;
  if (nothingToShow) return null;

  return (
    <section data-testid="people-face-privacy-status" className={`mb-5 rounded-3xl border p-5 ${needsAttention ? 'border-amber-300/20 bg-amber-500/[0.08]' : 'border-white/10 bg-white/[0.035]'}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {needsAttention ? <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-pink-200" />}
          <div className="min-w-0">
            <h2 className={`font-black ${needsAttention ? 'text-amber-50' : ''}`}>{needsAttention ? 'Face-data deletion needs retry' : activeDeletion ? 'Face-data deletion in progress' : 'Face privacy'}</h2>
            <div className="mt-2 flex flex-wrap gap-2"><Pill>On-device {local.granted ? 'on' : 'off'}</Pill><Pill>Cloud {cloud.granted ? 'on' : 'off'}</Pill></div>
            <p className={`mt-2 text-sm leading-6 ${needsAttention ? 'text-amber-100/60' : 'text-white/48'}`}>
              {needsAttention
                ? 'Cloud recognition remains off until the same deletion request is retried and verified.'
                : activeDeletion
                  ? 'SnapNext will not label recognition data deleted until AWS and every required SnapNext store are verified clear.'
                  : 'On-device detection and cloud recognition are separate permissions. Manage them in Privacy & security.'}
            </p>
          </div>
        </div>
        <Link href="/privacy-security" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-white/75 hover:bg-white/10">Manage face privacy<ChevronRight className="h-4 w-4" /></Link>
      </div>
    </section>
  );
}
