'use client';

import Link from 'next/link';
import { ArrowRight, CloudDownload, Clock3, ShieldCheck, Upload } from 'lucide-react';

export default function SmartSyncPage() {
  return <div className="mx-auto max-w-4xl space-y-6 pb-24">
    <header className="rounded-[2rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-500/10 via-white/[0.035] to-purple-500/10 p-6 sm:p-8">
      <div className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100"><CloudDownload className="h-3.5 w-3.5" /> SMART IMPORT</div>
      <h1 className="mt-4 text-3xl font-black sm:text-4xl">Choose what comes into SnapNext</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">For launch, SnapNext uses user-selected imports instead of permanent whole-cloud syncing. You choose the photos and videos; SnapNext copies only those items and never changes the originals.</p>
      <Link href="/imports" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black">Open Smart Import <ArrowRight className="h-4 w-4" /></Link>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <Card icon={ShieldCheck} title="Less access" copy="Google Drive and Google Photos use user-selection paths. No launch feature needs to crawl an entire cloud library." />
      <Card icon={Upload} title="Import safely" copy="Completed files remain safe even if an import is interrupted. Re-running skips files already protected in SnapNext." />
      <Card icon={Clock3} title="Auto Cloud Sync later" copy="Continuous Dropbox, OneDrive and background cloud sync stay out of launch until provider approvals, economics and demand justify them." />
    </section>

    <section className="rounded-3xl border border-amber-300/15 bg-amber-400/[0.06] p-5">
      <h2 className="font-black text-amber-50">Auto Cloud Sync — not enabled at launch</h2>
      <p className="mt-2 text-sm leading-6 text-amber-100/65">Existing legacy connections can still be disconnected, but SnapNext will not create new Dropbox or OneDrive background OAuth connections from this screen. Use Smart Import or normal file upload today.</p>
    </section>
  </div>;
}

function Card({ icon: Icon, title, copy }) {
  return <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5"><Icon className="h-5 w-5 text-cyan-200" /><h2 className="mt-4 font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-white/45">{copy}</p></div>;
}
