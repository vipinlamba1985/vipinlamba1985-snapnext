'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import {
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  PenTool,
  Play,
  Search,
  Sparkles,
  Upload,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function readableDate() {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function mediaDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  } catch {
    return '';
  }
}

function scoreMemory(item) {
  let score = 0;
  if (item.favorite || item.isFavorite) score += 40;
  if (item.aiAnalysis?.description) score += 25;
  if ((item.aiAnalysis?.tags || []).length) score += 12;
  if ((item.aiAnalysis?.locations || []).length) score += 8;
  if (item.kind === 'photo') score += 8;
  if (item.thumbnailUrl || item.storageKey) score += 5;
  return score;
}

function MemoryImage({ item, className = '' }) {
  if (!item) return <div className={`grid place-items-center bg-white/5 ${className}`}><ImageIcon className="h-7 w-7 text-white/30" /></div>;
  if (item.kind === 'video') {
    return <div className={`relative overflow-hidden bg-white/5 ${className}`}><video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted playsInline /><div className="absolute inset-0 grid place-items-center bg-black/25"><Play className="h-8 w-8 fill-white text-white" /></div></div>;
  }
  if (item.kind === 'photo') return <img src={mediaSrc(item.id)} alt={item.name || 'Memory'} className={`object-cover ${className}`} />;
  return <div className={`grid place-items-center bg-white/5 ${className}`}><PenTool className="h-7 w-7 text-pink-200" /></div>;
}

function normalizeEventData(value) {
  return {
    upcoming: Array.isArray(value?.upcoming) ? value.upcoming : [],
    incompleteProfiles: Array.isArray(value?.incompleteProfiles) ? value.incompleteProfiles : [],
    drafts: Array.isArray(value?.drafts) ? value.drafts : [],
  };
}

function SectionHeading({ title, action, href }) {
  return <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-[22px] font-black tracking-tight text-white md:text-2xl">{title}</h2>{href && <Link href={href} className="inline-flex items-center gap-1 text-[15px] font-bold text-pink-200">{action || 'View all'}<ChevronRight className="h-4 w-4" /></Link>}</div>;
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [media, setMedia] = useState([]);
  const [memories, setMemories] = useState(null);
  const [insights, setInsights] = useState(null);
  const [events, setEvents] = useState(normalizeEventData());
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [me, usageData, mediaData, memoriesData, insightsData, eventData] = await Promise.all([
        apiFetch('/auth/me').catch(() => null),
        apiFetch('/storage/usage').catch(() => null),
        apiFetch('/media').catch(() => null),
        apiFetch('/memories').catch(() => null),
        apiFetch('/insights').catch(() => null),
        apiFetch('/life-event-director').catch(() => null),
      ]);
      if (!active) return;
      setUser(me?.user || null);
      setUsage(usageData || null);
      setMedia((mediaData?.items || []).filter(item => !item.trashed));
      setMemories(memoriesData || null);
      setInsights(insightsData || null);
      setEvents(normalizeEventData(eventData));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const ranked = useMemo(() => [...media].sort((a, b) => scoreMemory(b) - scoreMemory(a)), [media]);
  const recent = useMemo(() => [...media].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [media]);
  const recentStrip = recent.slice(0, 6);
  const todayMemory = (memories?.onThisDay || [])[0] || ranked[0] || recent[0];
  const heroEvent = events.upcoming.find(item => item.daysUntil === 0) || events.upcoming.find(item => item.daysUntil <= 3) || events.upcoming[0];
  const usagePercent = usage && !usage.isSuper && usage.plan?.storageBytes ? Math.min(100, Math.round(((usage.usage?.bytes || 0) / usage.plan.storageBytes) * 100)) : 0;
  const storageLabel = usage?.isSuper ? 'Unlimited storage' : usage ? `${formatBytes(usage.usage?.bytes || 0)} of ${formatBytes(usage.plan?.storageBytes || 0)} used` : 'Storage status unavailable';
  const duplicateCount = insights?.duplicates?.extraCopies || 0;
  const firstName = user?.name?.split(' ')[0] || '';

  const feed = [
    { icon: Users, title: 'Family & communities', detail: events.drafts.length ? `${events.drafts.length} celebration package${events.drafts.length === 1 ? '' : 's'} being prepared` : 'See shared memories and conversations', href: '/community', tone: 'from-pink-500/20 to-purple-500/10' },
    { icon: Cloud, title: 'Smart Sync', detail: 'Review connected clouds and continue protected imports', href: '/smart-sync', tone: 'from-cyan-500/20 to-blue-500/10' },
    { icon: Sparkles, title: 'AI Studio', detail: todayMemory ? `Create something meaningful from ${todayMemory.name || 'today’s memories'}` : 'Create stories, posts and collages', href: '/ai-studio', tone: 'from-violet-500/20 to-fuchsia-500/10' },
  ];

  if (loading) return <div className="mx-auto max-w-5xl space-y-5 pb-36"><div className="h-36 animate-pulse rounded-[2rem] bg-white/[0.04]" /><div className="h-80 animate-pulse rounded-[2rem] bg-white/[0.04]" /><div className="h-44 animate-pulse rounded-[2rem] bg-white/[0.04]" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-7 overflow-hidden pb-36 md:pb-14">
      <header className="flex items-start justify-between gap-4 px-1 pt-1">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-white/55">{readableDate()}</p>
          <h1 className="mt-2 text-[34px] font-black leading-[1.08] tracking-tight text-white md:text-5xl">{greeting()}{firstName ? `, ${firstName}` : ''}<span className="ml-2">👋</span></h1>
          <p className="mt-3 text-[17px] leading-7 text-white/58">Here is what matters in your digital life today.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/search" aria-label="Search" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"><Search className="h-6 w-6" /></Link>
          <Link href="/notifications" aria-label="Notifications" className="relative grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"><Bell className="h-6 w-6" /></Link>
        </div>
      </header>

      {heroEvent ? (
        <section className="relative overflow-hidden rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-[#3b1738] via-[#25103e] to-[#101b2e] p-5 shadow-2xl shadow-purple-950/30 md:p-8">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-pink-400/20 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[14px] font-black text-pink-100"><CalendarDays className="h-4 w-4" />{heroEvent.daysUntil === 0 ? "Today’s special" : `${heroEvent.daysUntil} day${heroEvent.daysUntil === 1 ? '' : 's'} away`}</div>
            <h2 className="mt-4 max-w-2xl text-[30px] font-black leading-tight tracking-tight text-white md:text-4xl">{heroEvent.title}</h2>
            <p className="mt-3 max-w-2xl text-[17px] leading-7 text-white/68">SnapNext can prepare a reel, collage, status, greeting card and image post from your approved memories.</p>
            <div className="mt-5 flex flex-wrap gap-2">{(heroEvent.suggestions || []).slice(0, 5).map(item => <span key={item} className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-[14px] font-semibold text-white/75">{item.replaceAll('-', ' ')}</span>)}</div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/event-director" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-[17px] font-black text-black">View & prepare<ChevronRight className="h-5 w-5" /></Link>
              <Link href="/ai-studio" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-4 text-[17px] font-black text-white"><WandSparkles className="h-5 w-5" />Open AI Studio</Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-pink-500/10 to-purple-600/10 p-6"><h2 className="text-[26px] font-black">Never miss a meaningful day.</h2><p className="mt-2 text-[17px] leading-7 text-white/60">Add birthdays, anniversaries, cultural festivals and family traditions so SnapNext can prepare ideas early.</p><Link href="/event-director" className="mt-5 inline-flex rounded-2xl bg-white px-5 py-3 text-[16px] font-black text-black">Set up Event Director</Link></section>
      )}

      <section>
        <SectionHeading title="SnapNext feed" action="Open Connect" href="/community" />
        <div className="grid gap-3 md:grid-cols-3">
          {feed.map(item => <Link key={item.title} href={item.href} className={`rounded-[1.6rem] border border-white/10 bg-gradient-to-br ${item.tone} p-5 transition active:scale-[0.99]`}><item.icon className="h-7 w-7 text-white" /><h3 className="mt-4 text-[19px] font-black text-white">{item.title}</h3><p className="mt-2 text-[16px] leading-6 text-white/58">{item.detail}</p><div className="mt-4 inline-flex items-center gap-1 text-[15px] font-bold text-pink-100">Open<ChevronRight className="h-4 w-4" /></div></Link>)}
        </div>
      </section>

      {events.upcoming.length > 0 && <section><SectionHeading title="Coming up" action="View calendar" href="/event-director" /><div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">{events.upcoming.slice(0, 6).map(item => <Link href="/event-director" key={item.id} className="w-52 shrink-0 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"><div className="text-[14px] font-black uppercase tracking-wide text-pink-200">{item.type?.replaceAll('-', ' ')}</div><h3 className="mt-2 text-[18px] font-black leading-6 text-white">{item.title}</h3><p className="mt-3 text-[15px] font-semibold text-white/52">{item.daysUntil === 0 ? 'Today' : item.daysUntil === 1 ? 'Tomorrow' : `In ${item.daysUntil} days`}</p></Link>)}</div></section>}

      <section>
        <SectionHeading title="Continue where you left off" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link href="/smart-sync" className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"><Cloud className="h-6 w-6 text-cyan-200" /><h3 className="mt-3 text-[17px] font-black">Continue sync</h3><p className="mt-1 text-[15px] leading-5 text-white/48">Cloud imports and jobs</p></Link>
          <Link href="/ai-studio" className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"><Bot className="h-6 w-6 text-purple-200" /><h3 className="mt-3 text-[17px] font-black">Continue AI</h3><p className="mt-1 text-[15px] leading-5 text-white/48">Stories and creations</p></Link>
          <Link href="/community" className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"><MessageCircle className="h-6 w-6 text-pink-200" /><h3 className="mt-3 text-[17px] font-black">Continue chat</h3><p className="mt-1 text-[15px] leading-5 text-white/48">People and communities</p></Link>
          <Link href={duplicateCount ? '/health' : '/gallery'} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"><CheckCircle2 className="h-6 w-6 text-emerald-200" /><h3 className="mt-3 text-[17px] font-black">{duplicateCount ? 'Continue cleanup' : 'Open Gallery'}</h3><p className="mt-1 text-[15px] leading-5 text-white/48">{duplicateCount ? `${duplicateCount} items to review` : `${media.length} saved memories`}</p></Link>
        </div>
      </section>

      <section>
        <SectionHeading title="Recent moments" action="Open Gallery" href="/gallery" />
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {recentStrip.length ? recentStrip.map(item => <button key={item.id} onClick={() => setSelected(item)} className="relative h-52 w-40 shrink-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] text-left"><MemoryImage item={item} className="h-full w-full" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4"><p className="line-clamp-2 text-[16px] font-black text-white">{item.name || 'Saved memory'}</p><p className="mt-1 text-[14px] text-white/65">{mediaDate(item.createdAt)}</p></div>{(item.favorite || item.isFavorite) && <Heart className="absolute right-3 top-3 h-5 w-5 fill-pink-300 text-pink-300" />}</button>) : <Link href="/upload" className="flex min-h-44 w-full items-center justify-center rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-[17px] font-semibold text-white/55">Upload your first memories</Link>}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-[22px] font-black">Your digital life</h2><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[13px] font-bold text-emerald-200">Secure & private</span></div><p className="mt-2 text-[16px] text-white/55">{storageLabel}</p></div><Link href="/settings/storage" className="rounded-xl bg-white/8 px-4 py-3 text-[15px] font-bold text-purple-200">Manage storage</Link></div>
        {!usage?.isSuper && <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" style={{ width: `${usagePercent}%` }} /></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><Link href="/smart-sync" className="flex items-center gap-3 rounded-2xl bg-black/20 p-4"><Cloud className="h-7 w-7 text-cyan-200" /><div><div className="text-[16px] font-black">Smart Sync</div><div className="text-[14px] text-white/48">Manage clouds</div></div></Link><div className="flex items-center gap-3 rounded-2xl bg-black/20 p-4"><CheckCircle2 className="h-7 w-7 text-emerald-200" /><div><div className="text-[16px] font-black">Backup status</div><div className="text-[14px] text-white/48">Protected</div></div></div><Link href="/upload" className="flex items-center gap-3 rounded-2xl bg-black/20 p-4"><Upload className="h-7 w-7 text-pink-200" /><div><div className="text-[16px] font-black">Add memories</div><div className="text-[14px] text-white/48">Upload or import</div></div></Link></div>
      </section>

      {events.incompleteProfiles.length > 0 && <Link href="/event-director" className="flex items-center gap-4 rounded-[1.6rem] border border-amber-300/15 bg-amber-300/[0.06] p-5"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-300/10"><Users className="h-6 w-6 text-amber-200" /></div><div className="min-w-0 flex-1"><h3 className="text-[18px] font-black">Help SnapNext remember every occasion</h3><p className="mt-1 text-[15px] leading-6 text-white/55">Complete {events.incompleteProfiles[0].name}’s family or favourite-person profile.</p></div><ChevronRight className="h-5 w-5 text-white/40" /></Link>}

      {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-4 backdrop-blur-xl" onClick={() => setSelected(null)}><div className="mx-auto max-w-2xl pt-8" onClick={event => event.stopPropagation()}><MemoryImage item={selected} className="max-h-[62vh] w-full rounded-[2rem]" /><div className="mt-4 rounded-[2rem] border border-white/10 bg-[#0b0711] p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-[22px] font-black">{selected.name}</h3><p className="mt-1 text-[16px] text-white/45">{mediaDate(selected.createdAt)}</p></div><button onClick={() => setSelected(null)} className="grid h-11 w-11 place-items-center rounded-full bg-white/5"><X className="h-5 w-5" /></button></div>{selected.aiAnalysis?.description && <p className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-[16px] leading-7 text-white/65">{selected.aiAnalysis.description}</p>}<Link href="/ai-studio" className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-4 text-[17px] font-black"><Sparkles className="h-5 w-5" />Create with this memory</Link></div></div></div>}
    </div>
  );
}
