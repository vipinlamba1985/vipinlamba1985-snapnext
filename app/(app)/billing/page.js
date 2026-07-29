'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { Check, Crown, Loader2, ExternalLink, AlertTriangle, CheckCircle2, RefreshCw, Smartphone, ShieldCheck } from 'lucide-react';
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
  const [nativePlatform, setNativePlatform] = useState('');

  async function load() {
    const p = await fetch('/api/plans').then(r => r.json()); setPlans(p.plans || []);
    const u = await apiFetch('/auth/me'); setMe(u.user);
    const s = await apiFetch('/storage/usage'); setUsage(s);
    const b = await apiFetch('/billing/status'); setBilling(b);
  }

  useEffect(() => {
    if (Capacitor.isNativePlatform()) setNativePlatform(Capacitor.getPlatform() || 'native');
    load();
  }, []);

  useEffect(() => {
    if (nativePlatform) return;
    if (params.get('success')) {
      toast.success(params.get('mock') ? 'Plan upgraded (mock checkout)' : 'Subscription active! Welcome aboard.');
      load();
    } else if (params.get('cancelled')) {
      toast('Checkout cancelled.');
    } else if (params.get('portal') === 'mock') {
      toast('Customer portal is mock-mode only. Set up Stripe to enable real portal.');
    }
  }, [params, nativePlatform]);

  async function checkout(planId) {
    if (Capacitor.isNativePlatform()) {
      toast.error('Plan purchases are not available in this native build.');
      return;
    }
    setBusy(planId);
    try {
      const r = await apiFetch('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId, interval }) });
      if (r.url && !r.mock) window.location.href = r.url;
      else { toast.success('Plan activated (mock)'); load(); }
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }

  async function openPortal() {
    if (Capacitor.isNativePlatform()) {
      toast.error('Billing management is not available in this native build.');
      return;
    }
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
  const showPortal = !nativePlatform && !!sub && sub.provider === 'stripe' && me?.stripeCustomerId;
  const currentPlanId = me?.plan;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billing & Plans</h1>
        <p className="mt-1 text-white/60">
          {nativePlatform ? <span className="inline-flex items-center gap-1 text-sm"><Smartphone className="h-4 w-4" />Native app plan status</span> : isStripeMode ? 'Powered by Stripe' : <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200"><AlertTriangle className="h-3 w-3" /> Mock checkout — development mode</span>}
        </p>
      </div>

      {usage && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-white/60">Current plan</div>
              <div className="flex items-center gap-2 text-xl font-semibold">
                {usage.isSuper && <Crown className="h-4 w-4 text-amber-400" />} {usage.plan?.name || me?.plan}
                {sub?.status === 'past_due' && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200">Past due</span>}
                {sub?.status === 'trialing' && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-200">Trial</span>}
                {sub?.cancelAtPeriodEnd && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">Cancels at period end</span>}
              </div>
              {sub?.currentPeriodEnd && !usage.isSuper && (
                <div className="mt-1 text-xs text-white/50">
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
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: pct + '%' }} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {showPortal && (
              <button onClick={openPortal} disabled={busy === 'portal'} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">
                {busy === 'portal' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />} Manage billing
              </button>
            )}
            {!nativePlatform && !showPortal && sub && sub.provider !== 'stripe' && (
              <span className="inline-flex items-center gap-1 text-xs text-white/50"><Loader2 className="h-3 w-3" /> Stripe customer portal available once you upgrade via Stripe.</span>
            )}
            <button onClick={load} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
          </div>
        </div>
      )}

      {nativePlatform ? (
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 text-emerald-200" />
            <div>
              <h2 className="text-xl font-black text-white">Your current plan stays active</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Web checkout and external payment links are not shown inside the {nativePlatform === 'ios' ? 'iOS' : nativePlatform === 'android' ? 'Android' : 'native'} app. Plan purchases and subscription changes will appear here after native in-app billing is enabled.</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-sm" role="group" aria-label="Billing interval">
            {['monthly', 'yearly'].map(opt => (
              <button key={opt} onClick={() => setInterval(opt)} aria-pressed={interval === opt} className={`min-h-10 rounded-full px-4 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${interval === opt ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'text-white/60'}`}>
                {opt === 'monthly' ? 'Monthly' : 'Yearly · save 16%'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.filter(p => p.id !== 'super_user').map(p => {
              const current = currentPlanId === p.id;
              const price = p.prices?.[interval]?.amount ?? p.price;
              const priceId = p.prices?.[interval]?.stripePriceId;
              const stripeReady = !isStripeMode || !!priceId || p.id === 'free';
              return (
                <div key={p.id} className={`relative rounded-2xl border p-6 ${p.popular ? 'border-pink-400/40 bg-gradient-to-b from-pink-500/10 to-transparent' : 'border-white/10 bg-white/[0.03]'}`}>
                  {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-3 py-1 text-xs font-medium">Most popular</div>}
                  <div className="font-semibold">{p.name}</div>
                  <div className="mt-2 text-3xl font-bold">${price}<span className="text-base font-normal text-white/50">/{interval === 'monthly' ? 'mo' : 'yr'}</span></div>
                  <ul className="mt-4 space-y-2 text-sm text-white/70">
                    {p.features.map((f, i) => <li key={i} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" />{f}</li>)}
                  </ul>
                  {!stripeReady && (
                    <div className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-[11px] text-amber-200" role="alert">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                      <span>Stripe price ID missing for {interval}. Admin must set <code className="rounded bg-white/10 px-1">STRIPE_PRICE_{p.id.toUpperCase()}_{interval.toUpperCase()}</code>.</span>
                    </div>
                  )}
                  <button
                    disabled={current || busy === p.id || (p.id !== 'free' && !stripeReady)}
                    onClick={() => checkout(p.id)}
                    className={`mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${current ? 'bg-white/10' : p.popular ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'border border-white/15 hover:bg-white/5'} disabled:opacity-50`}
                  >
                    {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : current ? <CheckCircle2 className="h-4 w-4" /> : null}
                    {current ? 'Current plan' : isStripeMode && p.id !== 'free' ? `Subscribe to ${p.name}` : `Switch to ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
