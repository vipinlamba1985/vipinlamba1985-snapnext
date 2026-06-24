'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { HardDrive, CheckCircle2, AlertTriangle, RefreshCw, Cloud, Server } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

export default function StorageHealth() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try { const d = await apiFetch('/admin/storage/health'); setData(d); setErr(''); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  if (err) return <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm">{err}</div>;

  const active = data?.active;
  const local = data?.providers?.local;
  const s3 = data?.providers?.s3;
  const countsMap = Object.fromEntries((data?.mediaCounts || []).map(c => [c._id, c]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-fuchsia-300"/><h1 className="text-3xl font-bold">Storage health</h1></div>
        <div className="flex items-center gap-2">
          <Link href="/admin/emails" className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">Email log →</Link>
          <button onClick={load} disabled={busy} className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}/>Refresh</button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 p-5">
        <div className="text-xs text-white/60">Active provider</div>
        <div className="text-2xl font-bold uppercase mt-1">{active || '—'}</div>
        <div className="text-xs text-white/50 mt-1">Switch via <code className="px-1.5 py-0.5 rounded bg-white/10">STORAGE_PROVIDER</code> in .env</div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* LOCAL */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Server className="h-4 w-4 text-emerald-300"/><div className="font-semibold">Local disk</div></div>
            <Badge ok={local?.ready} label={local?.ready ? 'Ready' : 'Not ready'}/>
          </div>
          <KV k="Upload dir" v={local?.uploadDir} mono/>
          <KV k="Active" v={active === 'local' ? 'Yes — primary' : 'Fallback / legacy items'}/>
          <KV k="Files stored" v={countsMap.local ? `${countsMap.local.count} files · ${formatBytes(countsMap.local.bytes)}` : '0 files'}/>
        </div>

        {/* S3 */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-fuchsia-300"/><div className="font-semibold">AWS S3</div></div>
            <Badge ok={s3?.ready && s3?.bucketReachable} label={
              !s3?.ready ? 'Not configured' :
              s3?.bucketReachable ? 'Reachable' : 'Unreachable'
            }/>
          </div>
          <KV k="Region" v={s3?.region || '—'}/>
          <KV k="Bucket" v={s3?.bucket || '—'} mono/>
          <KV k="Active" v={active === 's3' ? 'Yes — primary' : 'Inactive'}/>
          <KV k="Files stored" v={countsMap.s3 ? `${countsMap.s3.count} files · ${formatBytes(countsMap.s3.bytes)}` : '0 files'}/>
          <KV k="Signed URL test" v={s3?.signedSample || (s3?.ready ? 'Failed' : '—')} mono/>
          {s3?.lastError && (
            <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-none"/><span>{s3.lastError}</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-white/50">
        Required env: <code className="px-1 bg-white/5 rounded">STORAGE_PROVIDER</code>,{' '}
        <code className="px-1 bg-white/5 rounded">AWS_ACCESS_KEY_ID</code>,{' '}
        <code className="px-1 bg-white/5 rounded">AWS_SECRET_ACCESS_KEY</code>,{' '}
        <code className="px-1 bg-white/5 rounded">AWS_REGION</code>,{' '}
        <code className="px-1 bg-white/5 rounded">AWS_S3_BUCKET</code>
      </div>
    </div>
  );
}

function Badge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'}`}>
      {ok ? <CheckCircle2 className="h-3 w-3"/> : <AlertTriangle className="h-3 w-3"/>} {label}
    </span>
  );
}
function KV({ k, v, mono }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/50">{k}</span>
      <span className={`text-xs text-right break-all max-w-[60%] ${mono ? 'font-mono text-white/80' : 'text-white/80'}`}>{v || '—'}</span>
    </div>
  );
}
