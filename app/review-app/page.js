'use client';

import { useState } from 'react';
import {
  Camera,
  Home,
  LayoutGrid,
  Heart,
  Sparkles,
  Users,
  User,
  UploadCloud,
  Download,
  MessageCircle,
  ShieldCheck,
  Search,
  Plus,
  Cloud,
  Wand2,
  CheckCircle2,
  Lock,
} from 'lucide-react';

const tabs = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'backup', label: 'Backup', icon: UploadCloud },
  { id: 'library', label: 'Library', icon: LayoutGrid },
  { id: 'memories', label: 'Memories', icon: Heart },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'connect', label: 'Connect', icon: Users },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'profile', label: 'Profile', icon: User },
];

const gradients = [
  'from-pink-400 to-fuchsia-600',
  'from-indigo-400 to-blue-600',
  'from-emerald-400 to-teal-600',
  'from-amber-300 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-violet-400 to-purple-700',
  'from-sky-400 to-cyan-600',
  'from-lime-300 to-emerald-600',
  'from-orange-300 to-red-500',
];

function Tile({ title, text, icon: Icon }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="font-black text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function Screen({ active }) {
  if (active === 'backup') {
    return <div className="space-y-5"><Hero title="Backup everything" text="One tap to pick photos and videos, clear status, no accidental duplicates, and plan-aware upload limits." icon={UploadCloud} /><div className="grid gap-4 md:grid-cols-3"><Tile title="Back up everything" text="Primary mobile CTA for full library selection." icon={Cloud} /><Tile title="Pick specific files" text="Fine control for selected uploads." icon={Plus} /><Tile title="Skipped summary" text="Shows storage full, too large, or unsupported files clearly." icon={CheckCircle2} /></div></div>;
  }
  if (active === 'library') {
    return <div className="space-y-5"><Hero title="Library" text="Modern gallery with search, filters, favorites, timeline, trash, and downloads." icon={LayoutGrid} /><div className="grid grid-cols-3 gap-2 md:grid-cols-6">{gradients.concat(gradients).map((g, i) => <div key={i} className={`aspect-square rounded-3xl bg-gradient-to-br ${g} shadow-sm`} />)}</div></div>;
  }
  if (active === 'memories') {
    return <div className="space-y-5"><Hero title="Memories" text="Story-style moments, On This Day, family highlights, and AI memory summaries." icon={Heart} /><div className="grid gap-4 md:grid-cols-3"><Tile title="On this day" text="Relive photos from previous years." icon={Heart} /><Tile title="Memory stories" text="AI turns groups of photos into stories." icon={Sparkles} /><Tile title="Ready to share" text="Convert memories into social posts." icon={Camera} /></div></div>;
  }
  if (active === 'ai') {
    return <div className="space-y-5"><Hero title="AI Create" text="Captions, hashtags, emojis, short story ideas, and post-ready social drafts." icon={Sparkles} /><div className="rounded-3xl bg-white p-6 shadow-sm"><div className="mb-3 text-sm font-black text-slate-500">Generated preview</div><p className="text-2xl font-black text-slate-900">Golden hour with the people I love ✨</p><p className="mt-3 text-slate-500">#memories #family #snapnext #readytopost</p></div></div>;
  }
  if (active === 'connect') {
    return <div className="space-y-5"><Hero title="Connect & Favorites" text="Invite favorite people, request consent, and share photos where both people appear." icon={Users} /><div className="grid gap-4 md:grid-cols-3"><Tile title="Permission first" text="No private photos shared without approval." icon={Lock} /><Tile title="Shared favorites" text="Both users see approved shared memories." icon={Heart} /><Tile title="Private groups" text="Family and community spaces for memories." icon={Users} /></div></div>;
  }
  if (active === 'chat') {
    return <div className="space-y-5"><Hero title="Chat" text="Private photo chat with favorite people and an inbuilt AI helper." icon={MessageCircle} /><div className="rounded-3xl bg-white p-6 shadow-sm"><div className="space-y-3"><div className="max-w-[75%] rounded-2xl bg-slate-100 p-3 text-sm">Can you make a caption for this photo?</div><div className="ml-auto max-w-[75%] rounded-2xl bg-indigo-600 p-3 text-sm text-white">Sure — here are 3 caption options.</div></div></div></div>;
  }
  if (active === 'profile') {
    return <div className="space-y-5"><Hero title="Profile & Plans" text="Storage, billing, plan limits, super user status, privacy, and account controls." icon={User} /><div className="grid gap-4 md:grid-cols-3"><Tile title="Free" text="15 GB limited access." icon={Cloud} /><Tile title="Plus / Pro" text="More storage and AI features." icon={Sparkles} /><Tile title="Family" text="Shared memory spaces and larger vault." icon={Users} /></div></div>;
  }
  return <div className="space-y-5"><Hero title="SnapNext AI Review App" text="Public review mode for the merged SnapNext backend + clone UI direction. Use the tabs to review the whole app flow without login." icon={Camera} /><div className="grid gap-4 md:grid-cols-4"><Tile title="Production core" text="Keep SnapNext backend, S3, billing, and auth." icon={ShieldCheck} /><Tile title="Modern UI" text="Use clone UI layout and mobile-first cards." icon={LayoutGrid} /><Tile title="AI workflow" text="Captions, stories, and ready-to-post tools." icon={Wand2} /><Tile title="Exports" text="Download manager and future ZIP export." icon={Download} /></div></div>;
}

function Hero({ title, text, icon: Icon }) {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-950 via-slate-900 to-pink-950 p-6 text-white shadow-xl md:p-8">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><Icon className="h-7 w-7" /></div>
      <h1 className="text-4xl font-black tracking-tight md:text-6xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 md:text-base">{text}</p>
    </div>
  );
}

export default function ReviewAppPage() {
  const [active, setActive] = useState('home');
  const activeTab = tabs.find(t => t.id === active) || tabs[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <aside className="hidden md:flex w-72 flex-col border-r border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 via-indigo-500 to-emerald-500 text-white shadow-lg"><Camera className="h-6 w-6" /></div>
          <div><div className="text-xl font-black tracking-tight">SnapNext <span className="text-indigo-600">AI</span></div><div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Public review mode</div></div>
        </div>
        <nav className="flex-1 space-y-2">{tabs.map((item) => { const Icon = item.icon; const selected = active === item.id; return <button key={item.id} onClick={() => setActive(item.id)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${selected ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</nav>
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4"><div className="mb-2 flex items-center justify-between text-xs font-bold"><span className="text-slate-500">Review Status</span><span className="text-emerald-600">Public</span></div><div className="text-xs leading-5 text-slate-500">This page does not require login and does not touch private user data.</div></div>
      </aside>
      <main className="flex-1 pb-24 md:pb-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-indigo-600 text-white"><activeTab.icon className="h-5 w-5" /></div><div><div className="font-black">{activeTab.label}</div><div className="text-[9px] font-bold uppercase tracking-widest text-indigo-600">Review app</div></div></div><Search className="h-5 w-5 text-slate-400" /></div></header>
        <section className="mx-auto max-w-7xl p-4 sm:p-6 md:p-8"><Screen active={active} /></section>
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-slate-200 bg-white/95 px-1 py-2 shadow-2xl backdrop-blur md:hidden">{tabs.slice(0, 5).map((item) => { const Icon = item.icon; const selected = active === item.id; return <button key={item.id} onClick={() => setActive(item.id)} className="flex flex-1 flex-col items-center gap-1 py-1 text-[10px] font-bold"><span className={`rounded-xl p-2 ${selected ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}><Icon className="h-4 w-4" /></span><span className={selected ? 'text-indigo-600' : 'text-slate-500'}>{item.label}</span></button>; })}</nav>
    </div>
  );
}
