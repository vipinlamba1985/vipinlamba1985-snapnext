'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { Check, Crown, Loader2, ExternalLink, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="text-white/50">Loading…</div>}>
      <BillingInner />
    </Suspense>
  );
}

function BillingInner() {
  const params = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [me, setMe] = useState(null);
  const [usage, setUsage] = useState(null);
  const [billing, setBilling] = useState(null);
  const [busy, setBusy] = useState('');
  const [interval, setInterval] = useState('monthly');

  async function load() {
    const p = await fetch('/api/plans').then(r => r.json()); setPlans(p.plans || []);
    const u = await apiFetch('/auth/me'); setMe(u.user);
    const s = await apiFetch('/storage/usage'); setUsage(s);
    const b = await apiFetch('/billing/status'); setBilling(b);
  }
  useEffect(() => { load(); }, []);

  // Toast banners from Stripe redirect.
  useEffect(() => {
    if (params.get('success')) {
      toast.success(params.get('mock') ? 'Plan upgraded (mock checkout)' : 'Subscription active! Welcome aboard.');
      load();
    } else if (params.get('cancelled')) {
      toast('Checkout cancelled.');
    } else if (params.get('portal') === 'mock') {
      toast('Customer portal is mock-mode only. Set up Stripe to enable real portal.');
    }
  }, [params]);

  async function checkout(planId) {
    setBusy(planId);
    try {
      const r = await apiFetch('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId, interval }) });
      if (r.url && !r.mock) window.location.href = r.url;
      else { toast.success('Plan activated (mock)'); load(); }
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }
  async function openPortal() {
    setBusy('portal');
    try {
      const r = await apiFetch('/billing/portal', { method: 'POST' });
      if (r.url) window.location.href = r.url;
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }

  const pct = usage && !usage.isSuper && usage.plan?.storageBytes ? Math.min(100, Math.round((usage.usage.bytes / usage.plan.storageBytes) * 100)) : 0;
  const sub = billing?.subscription;
  const isStripeMode = billing?.provider === 'stripe';
  const showPortal = !!sub && sub.provider === 'stripe' && me?.stripeCustomerId;
  const currentPlanId = me?.plan;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billing & Plans</h1>
        <p className="text-white/60 mt-1">
          {isStripeMode ? 'Powered by Stripe' : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-200 text-xs"><AlertTriangle className="h-3 w-3"/> Mock checkout — development mode</span>}
        </p>
      </div>

      {/* Current plan summary */}
      {usage && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-white/60">Current plan</div>
              <div className="text-xl font-semibold flex items-center gap-2">
                {usage.isSuper && <Crown className="h-4 w-4 text-amber-400"/>} {usage.plan?.name || me?.plan}
                {sub?.status === 'past_due' && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200">Past due</span>}
                {sub?.status === 'trialing' && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200">Trial</span>}
                {sub?.cancelAtPeriodEnd && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200">Cancels at period end</span>}
              </div>
              {sub?.currentPeriodEnd && !usage.isSuper && (
                <div className="text-xs text-white/50 mt-1">
                  {sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-white/60">Storage</div>
              <div className="text-xl font-semibold">{usage.isSuper ? '∞' : `${formatBytes(usage.usage.bytes)} / ${formatBytes(usage.plan.storageBytes)}`}</div>
            </div>
          </div>
          {!usage.isSuper && (
            <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: pct + '%' }} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {showPortal && (
              <button onClick={openPortal} disabled={busy === 'portal'} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-sm font-medium disabled:opacity-60">
                {busy === 'portal' ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <ExternalLink className="h-3.5 w-3.5"/>} Manage billing
              </button>
            )}
            {!showPortal && sub && sub.provider !== 'stripe' && (
              <span className="text-xs text-white/50 inline-flex items-center gap-1"><Loader2 className="h-3 w-3"/> Stripe customer portal available once you upgrade via Stripe.</span>
            )}
            <button onClick={load} className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-sm"><RefreshCw className="h-3.5 w-3.5"/>Refresh</button>
          </div>
        </div>
      )}

      {/* Interval toggle */}
      <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
        {['monthly', 'yearly'].map(opt => (
          <button key={opt} onClick={() => setInterval(opt)} className={`px-4 py-1.5 rounded-full ${interval === opt ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'text-white/60'}`}>
            {opt === 'monthly' ? 'Monthly' : 'Yearly · save 16%'}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {plans.filter(p => p.id !== 'super_user').map(p => {
          const current = currentPlanId === p.id;
          const price = p.prices?.[interval]?.amount ?? p.price;
          const priceId = p.prices?.[interval]?.stripePriceId;
          const stripeReady = !isStripeMode || !!priceId || p.id === 'free';
          return (
            <div key={p.id} className={`relative rounded-2xl border ${p.popular ? 'border-pink-400/40 bg-gradient-to-b from-pink-500/10 to-transparent' : 'border-white/10 bg-white/[0.03]'} p-6`}>
              {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium">Most popular</div>}
              <div className="font-semibold">{p.name}</div>
              <div className="mt-2 text-3xl font-bold">${price}<span className="text-base font-normal text-white/50">/{interval === 'monthly' ? 'mo' : 'yr'}</span></div>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                {p.features.map((f, i) => (<li key={i} className="flex items-center gap-2"><Check className="h-4 w-4 text-pink-400"/>{f}</li>))}
              </ul>
              {!stripeReady && (
                <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-[11px] text-amber-200 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-none mt-0.5"/>
                  <span>Stripe price ID missing for {interval}. Admin must set <code className="px-1 bg-white/10 rounded">STRIPE_PRICE_{p.id.toUpperCase()}_{interval.toUpperCase()}</code>.</span>
                </div>
              )}
              <button
                disabled={current || busy === p.id || (p.id !== 'free' && !stripeReady)}
                onClick={() => checkout(p.id)}
                className={`mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-medium ${current ? 'bg-white/10' : p.popular ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'border border-white/15 hover:bg-white/5'} disabled:opacity-50`}
              >
                {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin"/> : current ? <CheckCircle2 className="h-4 w-4"/> : null}
                {current ? 'Current plan' : isStripeMode && p.id !== 'free' ? `Subscribe to ${p.name}` : `Switch to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
