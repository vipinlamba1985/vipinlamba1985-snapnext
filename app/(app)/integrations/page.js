import Link from 'next/link';
import { ArrowRight, CloudDownload, Clock3, ShieldCheck } from 'lucide-react';

export default function IntegrationsPage() {
  return <div className="mx-auto max-w-4xl space-y-6 pb-32 md:pb-12">
    <header className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">More</p>
      <h1 className="mt-2 text-3xl font-black">Integrations</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">Manage service authorization here. People and social relationships remain exclusively in Circle.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-2">
      <IntegrationLink href="/imports" icon={CloudDownload} title="Smart Import" copy="Choose photos and videos from Google Photos or Google Drive without turning on whole-library background sync." />
      <IntegrationLink href="/smart-sync" icon={Clock3} title="Auto Cloud Sync" copy="See the launch boundary and future premium direction. Continuous cloud sync is not enabled at launch." />
    </section>

    <section className="rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.06] p-5">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><h2 className="font-black text-emerald-50">Service boundary</h2><p className="mt-1 text-sm leading-6 text-emerald-100/60">Smart Import receives only what the user selects. Dropbox and OneDrive do not create new persistent background connections at launch. Instagram, YouTube and other human/profile relationships stay in Circle.</p></div></div>
    </section>
  </div>;
}

function IntegrationLink({ href, icon: Icon, title, copy }) {
  return <Link href={href} className="group rounded-3xl border border-white/8 bg-white/[0.03] p-5 transition hover:bg-white/[0.055]"><div className="flex items-center justify-between"><Icon className="h-5 w-5 text-cyan-200" /><ArrowRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-1" /></div><h2 className="mt-4 font-black">{title}</h2><p className="mt-1 text-sm leading-6 text-white/45">{copy}</p></Link>;
}
