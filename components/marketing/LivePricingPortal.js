'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check } from 'lucide-react';

function formatStorage(storageGb) {
  return `${storageGb} GB`;
}

export default function LivePricingPortal() {
  const [target, setTarget] = useState(null);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    const pricingTarget = document.getElementById('pricing');
    setTarget(pricingTarget);
    let active = true;

    fetch('/api/plans')
      .then((response) => {
        if (!response.ok) throw new Error('Plans are temporarily unavailable.');
        return response.json();
      })
      .then((data) => {
        const nextPlans = Array.isArray(data.plans) ? data.plans : [];
        if (!active || !pricingTarget || !nextPlans.length) return;
        setPlans(nextPlans);
        pricingTarget.dataset.livePricingReady = 'true';
      })
      .catch(() => {
        // Keep the server-rendered pricing fallback visible when the live
        // catalogue cannot be loaded or hydration does not complete.
      });

    return () => {
      active = false;
      if (pricingTarget) delete pricingTarget.dataset.livePricingReady;
    };
  }, []);

  if (!target || !plans.length) return null;

  return createPortal(
    <div data-snapnext-live-pricing className="mx-auto max-w-7xl">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-pink-300">Pricing</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Start free. Grow when ready.</h2>
        <p className="mt-3 text-sm leading-6 text-white/62 sm:text-base">One clear plan catalogue across SnapNext, Billing, and your storage limits.</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {plans.map((plan) => {
          const monthly = Number(plan.prices?.monthly?.amount ?? plan.price ?? 0);
          const yearly = Number(plan.prices?.yearly?.amount ?? 0);
          const featured = plan.popular === true;
          return (
            <article key={plan.id} className={`relative flex flex-col rounded-[2rem] border p-5 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1 ${featured ? 'border-pink-400/50 bg-gradient-to-b from-pink-500/15 to-purple-950/20 shadow-pink-950/25' : 'border-white/10 bg-white/[0.03] hover:border-pink-300/20 hover:bg-white/[0.045]'}`}>
              {featured && <div className="absolute right-4 top-4 rounded-full bg-pink-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">Popular</div>}
              <h3 className="text-xl font-black text-white">{plan.name}</h3>
              <p className="mt-2 min-h-16 text-sm leading-5 text-white/55">{plan.description}</p>
              <div className="mt-5">
                <span className="text-3xl font-black text-white">${monthly.toFixed(monthly % 1 === 0 ? 0 : 2)}</span>
                <span className="text-sm text-white/45">/month</span>
                {yearly > 0 && <p className="mt-1 text-xs text-white/40">${yearly.toFixed(2)}/year</p>}
              </div>
              <p className="mt-4 text-sm font-bold text-pink-200">{formatStorage(plan.storageGb)} storage</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-white/65">
                {(plan.features || []).slice(0, 5).map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{feature}</li>)}
              </ul>
              <Link href={`/signup?plan=${plan.id}`} className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${featured ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'bg-white text-black'}`}>{plan.id === 'free' ? 'Start Free' : `Choose ${plan.name}`}</Link>
            </article>
          );
        })}
      </div>
    </div>,
    target,
  );
}
