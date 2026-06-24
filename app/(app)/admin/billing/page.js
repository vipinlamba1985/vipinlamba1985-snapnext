'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { CreditCard, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function AdminBilling() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try { const d = await apiFetch('/admin/billing/health'); setData(d); setErr(''); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  if (err) return <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm">{err}</div>;
  if (!data) return <div className="text-white/50">Loading…</div>;

  const ready = data.ready;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-300"/><h1 className="text-3xl font-bold">Billing health</h1></div>
        <div className="flex items-center gap-2">
          <Link href="/admin/storage" className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">Storage health →</Link>
          <Link href="/admin/emails" className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">Email log →</Link>
          <button onClick={load} disabled={busy} className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}/>Refresh</button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-fuchsia-500/10 p-5">
        <div className="text-xs text-white/60">Active provider</div>
        <div className="text-2xl font-bold uppercase mt-1">{data.active}</div>
        <div className="text-xs text-white/50 mt-1">Switch via <code className="px-1.5 py-0.5 rounded bg-white/10">BILLING_PROVIDER</code> (mock | stripe). Production refuses mock mode unless explicitly enabled.</div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Stripe configuration</div>
            <Badge ok={ready} label={ready ? 'Ready' : 'Incomplete'} />
          </div>
          <KV k="Secret key" v={data.stripeKey || '— (missing)'} mono ok={!!data.stripeKey}/>
          <KV k="Webhook secret" v={data.webhookSecret ? 'Configured' : '— (missing)'} ok={data.webhookSecret}/>
          <KV k="Publishable key" v={data.publishableKey ? 'Configured' : '— (missing)'} ok={data.publishableKey}/>
          {data.missing?.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-none"/>
              <div>Missing env vars: {data.missing.join(', ')}.</div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="font-semibold mb-3">Price IDs</div>
          {Object.entries(data.priceIds || {}).map(([k, v]) => (
            <KV key={k} k={`STRIPE_PRICE_${k.toUpperCase()}`} v={v ? 'Configured' : '—'} ok={v}/>
          ))}
          {!data.hasAnyPrices && (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-none"/>
              <div>No Stripe price IDs configured. Paid plans cannot be checked out in Stripe mode.</div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="font-semibold mb-3">Subscriptions by plan / status</div>
        {data.subscriptionCounts?.length === 0 ? <div className="text-sm text-white/50">No subscriptions yet.</div> : (
          <table className="w-full text-sm"><thead><tr className="text-xs text-white/50"><th className="text-left py-1">Plan</th><th className="text-left">Status</th><th className="text-right">Count</th></tr></thead>
          <tbody>{data.subscriptionCounts.map((c, i) => (
            <tr key={i} className="border-t border-white/5"><td className="py-1.5">{c._id?.plan || '—'}</td><td>{c._id?.status || '—'}</td><td className="text-right">{c.count}</td></tr>
          ))}</tbody></table>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="font-semibold mb-3">Recent billing events</div>
        {data.recentEvents?.length === 0 ? <div className="text-sm text-white/50">No events yet.</div> : (
          <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
            {data.recentEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.status === 'processed' ? 'bg-emerald-500/15 text-emerald-200' : e.status === 'error' ? 'bg-rose-500/15 text-rose-200' : 'bg-white/10 text-white/70'}`}>{e.status}</span>
                <span className="font-mono text-xs text-white/70 w-44 truncate">{e.type}</span>
                <span className="flex-1 truncate text-white/60">{e.payload?.id || e.userId || ''}</span>
                <span className="text-xs text-white/40">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
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

function KV({ k, v, mono, ok = null }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/50">{k}</span>
      <span className={`text-xs text-right break-all max-w-[60%] ${mono ? 'font-mono' : ''} ${ok === false ? 'text-rose-300' : ok === true ? 'text-emerald-300' : 'text-white/80'}`}>
        {ok === true && <CheckCircle2 className="h-3 w-3 inline mr-1"/>}
        {v}
      </span>
    </div>
  );
}
