'use client';

import Link from 'next/link';
import {
  Camera,
  Home,
  LayoutGrid,
  Heart,
  Sparkles,
  Users,
  User,
  CloudLightning,
  UploadCloud,
  Download,
  ShieldCheck,
  Wand2,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'library', label: 'Library', icon: LayoutGrid },
  { id: 'memories', label: 'Memories', icon: Heart },
  { id: 'create', label: 'AI Create', icon: Sparkles },
  { id: 'connect', label: 'Connect', icon: Users },
];

const quickActions = [
  { title: 'Back up everything', text: 'One tap photo and video backup with clear progress.', icon: UploadCloud, href: '/backup' },
  { title: 'Open Library', text: 'Timeline, favorites, search, restore, and downloads.', icon: LayoutGrid, href: '/gallery' },
  { title: 'AI Caption', text: 'Create captions, hashtags, stories, and post ideas.', icon: Wand2, href: '/ready-to-post' },
  { title: 'Download Manager', text: 'Export selected memories or prepare bulk downloads.', icon: Download, href: '/downloads' },
];

const memoryTiles = [
  'from-pink-400 to-fuchsia-600',
  'from-indigo-400 to-blue-600',
  'from-emerald-400 to-teal-600',
  'from-amber-300 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-violet-400 to-purple-700',
];

export default function MergedPreviewPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <aside className="hidden md:flex w-72 flex-col border-r border-slate-200 bg-white/90 p-6 shadow-sm">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <BrandLogo size={48} />
          <div>
            <div className="text-xl font-black tracking-tight">SnapNext <span className="text-indigo-600">AI</span></div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Every memory. One safe place.</div>
          </div>
        </Link>

        <nav className="flex-1 space-y-2">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const active = index === 0;
            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                  active ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-500">Vault Space</span>
            <span className="text-indigo-600">15 GB Free</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-indigo-500 to-pink-500" />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-500">
            <CloudLightning className="h-4 w-4 text-indigo-500" />
            Upgrade unlocks larger backup flows
          </div>
        </div>
      </aside>

      <main className="flex-1 pb-24 md:pb-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <BrandLogo size={40} />
              <div>
                <div className="font-black">SnapNext</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-600">Merged build</div>
              </div>
            </Link>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-xs font-black text-indigo-700">VL</div>
          </div>
        </header>

        <section className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 md:p-8">
          <div className="overflow-hidden rounded-[2rem] border border-white bg-gradient-to-br from-indigo-950 via-slate-900 to-pink-950 p-6 text-white shadow-xl md:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white/80">
                  <Sparkles className="h-4 w-4 text-pink-300" />
                  SnapNext backend + Clone UI experience
                </div>
                <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                  A cleaner, more premium home for your memories.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 md:text-base">
                  This preview keeps the production SnapNext foundation and applies the modern mobile-first direction from the clone UI: simple tabs, beautiful cards, storage clarity, and fast backup actions.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/backup" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">
                    Start Backup <ChevronRight className="h-4 w-4" />
                  </Link>
                  <Link href="/gallery" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">
                    View Library
                  </Link>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-3 backdrop-blur">
                <div className="grid grid-cols-3 gap-2">
                  {memoryTiles.map((gradient, index) => (
                    <div key={gradient} className={`aspect-square rounded-2xl bg-gradient-to-br ${gradient} shadow-lg`}>
                      {index === 1 && <div className="m-2 inline-flex rounded-full bg-white/20 px-2 py-1 text-[10px] font-bold">AI</div>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl bg-black/20 p-3 text-xs text-white/75">
                  “Golden hour with the people I love.” · Auto-caption ready
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.title} href={action.href} className="group rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-black">{action.title}</div>
                  <p className="mt-2 text-sm leading-5 text-slate-500">{action.text}</p>
                </Link>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black">Merged build checklist</h2>
                  <p className="text-sm text-slate-500">Safe migration path from clone UI into production SnapNext.</p>
                </div>
                <ShieldCheck className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  'Keep Next.js backend active',
                  'Port clone layout safely',
                  'Use existing backup/gallery links',
                  'Do not copy demo-only APIs',
                  'Test mobile bottom tabs',
                  'Replace screens gradually',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-100 to-pink-100 text-sm font-black text-indigo-700">VL</div>
                <div>
                  <div className="font-black">Super User View</div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Admin-ready shell</div>
                </div>
              </div>
              <p className="text-sm leading-6 text-slate-500">
                This route is intentionally separate from production pages. It proves the merged visual direction first, then each real feature can be connected screen by screen.
              </p>
            </div>
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-slate-200 bg-white/95 px-2 py-2 shadow-2xl backdrop-blur md:hidden">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const active = index === 0;
          return (
            <button key={item.id} className="flex flex-1 flex-col items-center gap-1 py-1 text-[10px] font-bold">
              <span className={`rounded-xl p-2 ${active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={active ? 'text-indigo-600' : 'text-slate-500'}>{item.label === 'AI Create' ? 'Create' : item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
