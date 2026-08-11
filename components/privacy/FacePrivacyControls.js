'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

function StatePill({ children }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white/55">{children}</span>;
}

export default function FacePrivacyControls() {
  const [local, setLocal] = useState(null);
  const [cloud, setCloud] = useState(null);
  const [busy, setBusy] = useState('');

  async function load() {
    const [localState, cloudState] = await Promise.all([
      apiFetch('/settings/local-face-detection-consent'),
      apiFetch('/settings/face-processing-consent'),
    ]);
    setLocal(localState);
    setCloud(cloudState);
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function act(key, request, success) {
    setBusy(key);
    try {
      await request();
      await load();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error?.message || 'Privacy setting could not be updated.');
    } finally {
      setBusy('');
    }
  }

  if (!local || !cloud) return <div className="grid min-h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>;

  const deletionStatus = cloud.deletionStatus || 'none';
  const deletionActive = ['pending', 'processing', 'verifying'].includes(deletionStatus);
  const canRequestDeletion = !cloud.granted && !deletionActive && deletionStatus !== 'failed' && deletionStatus !== 'verified_deleted';

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-black">On-device face detection</h2><StatePill>{local.granted ? 'On' : 'Off'}</StatePill></div>
            <p className="mt-2 text-sm leading-6 text-white/48">SnapNext counts faces on this device to decide which photos are eligible for People organization. This permission does not authorize AWS matching or cloud face-vector storage.</p>
          </div>
          {local.granted
            ? <button disabled={!!busy} onClick={() => act('local-off', () => apiFetch('/settings/local-face-detection-consent', { method: 'DELETE' }), 'On-device face detection is off.')} className="min-h-11 rounded-full border border-white/10 px-4 text-xs font-black text-white/70 disabled:opacity-50">{busy === 'local-off' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Turn off'}</button>
            : <button disabled={!!busy || !local.available} onClick={() => act('local-on', () => apiFetch('/settings/local-face-detection-consent', { method: 'POST' }), 'On-device face detection enabled.')} className="min-h-11 rounded-full bg-white px-4 text-xs font-black text-black disabled:opacity-50">{busy === 'local-on' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Enable on-device detection'}</button>}
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-black">Favourite People cloud matching</h2><StatePill>{cloud.granted ? 'On' : 'Off'}</StatePill></div>
            <p className="mt-2 text-sm leading-6 text-white/48">When enabled, AWS Rekognition may be used only to match the 2–3 Favourite People you explicitly choose, depending on your plan. Other faces are not added automatically. This permission is separate from on-device detection.</p>
          </div>
          {cloud.granted
            ? <button disabled={!!busy} onClick={() => act('cloud-off', () => apiFetch('/settings/face-processing-consent', { method: 'DELETE' }), 'Favourite People cloud matching is off. Existing recognition data has not been deleted.')} className="min-h-11 rounded-full border border-white/10 px-4 text-xs font-black text-white/70 disabled:opacity-50">{busy === 'cloud-off' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Turn off cloud matching'}</button>
            : <button disabled={!!busy || !cloud.available || cloud.deletionNeedsRetry || deletionActive} onClick={() => act('cloud-on', () => apiFetch('/settings/face-processing-consent', { method: 'POST' }), 'Favourite People cloud matching enabled.')} className="min-h-11 rounded-full bg-white px-4 text-xs font-black text-black disabled:opacity-50">{busy === 'cloud-on' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Enable Favourite People'}</button>}
        </div>
      </section>

      <section className="rounded-3xl border border-rose-300/15 bg-rose-500/[0.045] p-5">
        <div className="flex items-start gap-3"><Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" /><div className="min-w-0 flex-1"><h2 className="font-black">Stored Favourite People recognition data</h2><p className="mt-1 text-sm leading-6 text-white/48">Deleting recognition data removes both the retired People collection and the Favourite-only Rekognition collection, plus SnapNext recognition-derived records. Your original photos and videos remain in Library.</p></div></div>

        {cloud.granted && <div className="mt-4 rounded-2xl border border-white/8 bg-black/10 p-4 text-sm text-white/55">Turn off Favourite People cloud matching first. Revoking permission does not delete existing recognition data.</div>}

        {canRequestDeletion && <button disabled={!!busy} onClick={() => act('delete', () => apiFetch('/settings/face-processing-consent/deletion', { method: 'POST' }), null)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-500 px-5 text-xs font-black text-white disabled:opacity-50">{busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete stored recognition data</button>}

        {deletionActive && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-500/[0.08] p-4"><Loader2 className="mt-0.5 h-4 w-4 animate-spin text-amber-200" /><div><div className="text-sm font-black text-amber-50">Deletion in progress</div><p className="mt-1 text-xs leading-5 text-amber-100/60">SnapNext will not call this data deleted until AWS and every required SnapNext store have been verified clear.</p></div></div>}

        {deletionStatus === 'failed' && <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/[0.08] p-4"><div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-4 w-4 text-amber-200" /><div><div className="text-sm font-black text-amber-50">Deletion needs retry</div><p className="mt-1 text-xs leading-5 text-amber-100/60">The previous attempt did not complete or could not be verified. Favourite People cloud matching remains off.</p>{cloud.deletionLastError && <p className="mt-2 text-[11px] text-amber-100/45">{cloud.deletionLastError}</p>}</div></div><button disabled={!!busy} onClick={() => act('retry', () => apiFetch('/settings/face-processing-consent/deletion', { method: 'PATCH' }), null)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-amber-200/20 px-4 text-xs font-black text-amber-50 disabled:opacity-50">{busy === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Retry deletion</button></div>}

        {deletionStatus === 'verified_deleted' && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/[0.07] p-4"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-200" /><div><div className="text-sm font-black text-emerald-50">Deletion verified</div><p className="mt-1 text-xs leading-5 text-emerald-100/60">The promised Favourite People cloud-recognition stores were checked and confirmed clear. Cloud matching remains off until you explicitly enable it again.</p></div></div>}
      </section>

      <div className="flex items-center gap-2 text-xs text-white/35"><ShieldCheck className="h-4 w-4" />Privacy controls are server-authoritative. Closing the app does not cancel a deletion request.</div>
    </div>
  );
}
