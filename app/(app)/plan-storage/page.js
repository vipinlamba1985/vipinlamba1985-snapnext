'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Cloud, CreditCard, HardDrive, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';

export default function PlanStoragePage() {
  const [usage, setUsage] = useState(null);
  useEffect(() => { apiFetch('/storage/usage').then(setUsage).catch(() => setUsage(false)); }, []);

  return <div className="mx-auto max-w-4xl space-y-6 pb-32 md:pb-12">
    <header className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">More</p>
      <h1 className="mt-2 text-3xl font-black">Plan & storage</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">One place to understand your SnapNext plan, storage capacity and backup controls without mixing them into Library or Add.</p>
    </header>

    <section className="rounded-3xl border border-white/8 bg-gradient-to-br from-pink-500/10 to-purple-500/8 p-5">
      <div className="flex items-center gap-3"><HardDrive className="h-5 w-5 text-pink-200" /><h2 className="font-black">Current storage</h2></div>
      {usage === null ? <Loader2 className="mt-5 h-5 w-5 animate-spin text-white/40" /> : usage === false ? <p className="mt-4 text-sm text-white/45">Storage usage is temporarily unavailable.</p> : <div className="mt-4"><div className="text-2xl font-black">{formatBytes(usage.usage?.bytes || 0)}</div><p className="mt-1 text-sm text-white/45">{usage.isSuper ? 'Unlimited storage plan' : `${formatBytes(usage.plan?.storageBytes || 0)} total capacity`}</p>{!usage.isSuper && usage.plan?.storageBytes ? <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: `${Math.min(100, Math.round(((usage.usage?.bytes || 0) / usage.plan.storageBytes) * 100))}%` }} /></div> : null}</div>}
    </section>

    <section className="grid gap-3 sm:grid-cols-2">
      <Action href="/billing" icon={CreditCard} title="Plan & billing" copy="Upgrade, review plan access and manage billing." />
      <Action href="/smart-sync" icon={Cloud} title="Storage & backup" copy="Manage Smart Sync jobs and protected copies." />
    </section>
  </div>;
}

function Action({ href, icon: Icon, title, copy }) {
  return <Link href={href} className="group rounded-3xl border border-white/8 bg-white/[0.03] p-5 transition hover:bg-white/[0.055]"><div className="flex items-center justify-between"><Icon className="h-5 w-5 text-pink-200" /><ArrowRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-1" /></div><h2 className="mt-4 font-black">{title}</h2><p className="mt-1 text-sm leading-6 text-white/45">{copy}</p></Link>;
}
