'use client';

import Link from 'next/link';
import { Users, ChevronRight, ShieldCheck } from 'lucide-react';

export default function FamilyPlanEntry() {
  return <Link href="/family" className="block rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-emerald-500/5 p-5 transition hover:border-cyan-300/35"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/15"><Users className="h-6 w-6 text-cyan-200" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="text-lg font-bold">Family management</h2><ShieldCheck className="h-4 w-4 text-emerald-300" /></div><p className="mt-1 text-sm text-white/50">Invite up to five members, manage roles, and use one shared AI allowance while personal libraries remain private.</p></div><ChevronRight className="h-5 w-5 text-white/40" /></div></Link>;
}
