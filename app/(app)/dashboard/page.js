'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import {
  Bell, Bot, CalendarDays, CheckCircle2, ChevronRight, Cloud, Heart,
  Image as ImageIcon, MessageCircle, PenTool, Play, Search, Sparkles,
  Upload, Users, WandSparkles, X, BriefcaseBusiness, BookOpen, Trophy,
  Clapperboard, UserRound, MessagesSquare, AtSign, Images, CakeSlice,
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
  try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
}

function MemoryImage({ item, className = '' }) {
  if (!item) return <div className={`grid place-items-center bg-white/5 ${className}`}><ImageIcon className="h-7 w-7 text-white/30" /></div>;
  if (item.kind === 'video') return <div className={`relative overflow-hidden bg-white/5 ${className}`}><video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted playsInline preload="metadata" /><div className="absolute inset-0 grid place-items-center bg-black/25"><Play className="h-8 w-8 fill-white" /></div></div>;
  if (item.kind === 'photo') return <img src={mediaSrc(item.id)} loading="lazy" decoding="async" alt={item.name || 'Memory'} className={`object-cover ${className}`} />;
  return <div className={`grid place-items-center bg-white/5 ${className}`}><PenTool className="h-7 w-7 text-pink-200" /></div>;
}

function SectionHeading({ title, subtitle, href, action = 'View all' }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-[23px] font-black tracking-tight md:text-3xl">{title}</h2>{subtitle && <p className="mt-1 text-[15px] text-white/48">{subtitle}</p>}</div>{href && <Link href={href} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold text-pink-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">{action}<ChevronRight className="h-4 w-4" /></Link>}</div>;
}

function normalizeEvents(value) {
  return {
    upcoming: Array.isArray(value?.upcoming) ? value.upcoming : [],
    incompleteProfiles: Array.isArray(value?.incompleteProfiles) ? value.incompleteProfiles : [],
    drafts: Array.isArray(value?.drafts) ? value.drafts : [],
  };
}

const circles = [
  { title: 'Family', icon: Users, href: '/favorites', tone: 'from-pink-500/20 to-rose-500/5' },
  { title: 'Close Friends', icon: Heart, href: '/community', tone: 'from-purple-500/20 to-fuchsia-500/5' },
  { title: 'Work', icon: BriefcaseBusiness, href: '/community', tone: 'from-blue-500/20 to-cyan-500/5' },
  { title: 'Knowledge', icon: BookOpen, href: '/journal', tone: 'from-amber-500/20 to-orange-500/5' },
  { title: 'Entertainment', icon: Clapperboard, href: '/community', tone: 'from-violet-500/20 to-indigo-500/5' },
  { title: 'Sports', icon: Trophy, href: '/community', tone: 'from-emerald-500/20 to-teal-500/5' },
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [media, setMedia] = useState([]);
  const [memories, setMemories] = useState(null);
  const [insights, setInsights] = useState(null);
  const [events, setEvents] = useState(normalizeEvents());
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch('/auth/me').catch(() => null),
      apiFetch('/media?limit=24').catch(() => null),
      apiFetch('/memories').catch(() => null),
      apiFetch('/insights').catch(() => null),
      apiFetch('/life-event-director').catch(() => null),
    ]).then(([me, mediaData, memoriesData, insightsData, eventData]) => {
      if (!active) return;
      setUser(me?.user || null);
      setMedia((mediaData?.items || []).filter(item => !item.trashed));
      setMemories(memoriesData || null);
      setInsights(insightsData || null);
      setEvents(normalizeEvents(eventData));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const recent = useMemo(() => [...media].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [media]);
  const highlights = useMemo(() => {
    const onThisDay = Array.isArray(memories?.onThisDay) ? memories.onThisDay : [];
    return [...onThisDay, ...recent].filter((item, index, all) => item?.id && all.findIndex(x => x.id === item.id) === index).slice(0, 8);
  }, [memories, recent]);
  const heroEvent = events.upcoming.find(item => item.daysUntil === 0) || events.upcoming.find(item => item.daysUntil <= 3) || events.upcoming[0];
  const duplicateCount = insights?.duplicates?.extraCopies || 0;
  const firstName = user?.name?.split(' ')[0] || '';
  const celebrationCount = events.upcoming.filter(item => Number(item.daysUntil) <= 14).length;

  const messages = [
    { icon: MessageCircle, title: 'Private chats', detail: 'Continue conversations', href: '/chat' },
    { icon: MessagesSquare, title: 'Community replies', detail: 'See posts and discussions', href: '/community' },
    { icon: Images, title: 'Album activity', detail: 'Shared memories and comments', href: '/favorites' },
    { icon: Bot, title: 'AI conversations', detail: 'Continue with SnapNext AI', href: '/chat' },
    { icon: AtSign, title: 'Mentions', detail: 'Review notifications', href: '/notifications' },
  ];

  const aiSuggestions = [
    { title: heroEvent ? `Create for ${heroEvent.title}` : 'Create a celebration video', detail: 'Reel, card, caption or collage', href: heroEvent ? '/event-director' : '/ai-video', icon: CakeSlice },
    { title: duplicateCount ? 'Clean duplicate photos' : 'Review memory health', detail: duplicateCount ? `${duplicateCount} extra copies found` : 'Keep your library organized', href: '/health', icon: CheckCircle2 },
    { title: 'Back up today’s photos', detail: 'Continue protected upload', href: '/upload', icon: Cloud },
    { title: 'Organize screenshots', detail: 'Use AI categories and search', href: '/gallery?q=screenshot', icon: Images },
    { title: 'Create a travel movie', detail: 'Turn memories into a story', href: '/ai-video', icon: Play },
    { title: 'Create a social post', detail: 'Caption, hashtags and visual', href: '/ready-to-post', icon: Sparkles },
  ];

  if (loading) return <div className="mx-auto max-w-6xl space-y-6 pb-36" aria-label="Loading Today"><div className="h-48 animate-pulse rounded-[2rem] bg-white/[0.04]" /><div className="h-72 animate-pulse rounded-[2rem] bg-white/[0.04]" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-3xl bg-white/[0.04]" />)}</div></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-8 overflow-hidden pb-36 md:pb-14">
      <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#351329] via-[#170b2b] to-[#071923] p-6 md:p-9">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div><p className="text-[16px] font-semibold text-white/58">{readableDate()}</p><h1 className="mt-2 text-[36px] font-black leading-tight tracking-tight md:text-6xl">{greeting()}{firstName ? `, ${firstName}` : ''}</h1><p className="mt-3 max-w-2xl text-[18px] leading-7 text-white/64">Today looks beautiful. You have {celebrationCount || 'a few'} things worth remembering.</p></div>
          <div className="flex shrink-0 gap-2"><Link href="/search" aria-label="Search SnapNext" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]"><Search className="h-5 w-5" /></Link><Link href="/notifications" aria-label="Open notifications" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]"><Bell className="h-5 w-5" /></Link></div>
        </div>
      </header>

      <section>
        <SectionHeading title="Time to celebrate" subtitle="Meaningful moments SnapNext can help you prepare" href="/event-director" action="Open calendar" />
        {heroEvent ? <div className="relative overflow-hidden rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-pink-500/20 via-purple-500/15 to-cyan-500/10 p-6 md:p-8"><div className="inline-flex rounded-full bg-white/10 px-3 py-2 text-sm font-black text-pink-100">{heroEvent.daysUntil === 0 ? 'Today' : heroEvent.daysUntil === 1 ? 'Tomorrow' : `In ${heroEvent.daysUntil} days`}</div><h3 className="mt-4 text-3xl font-black md:text-4xl">{heroEvent.title}</h3><p className="mt-3 max-w-2xl text-[17px] leading-7 text-white/62">Prepare a reel, collage, greeting, story or ready-to-post message using approved memories.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/event-director" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-5 font-black text-black">Plan celebration</Link><Link href="/ai-studio" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-5 font-black">Create now</Link></div></div> : <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"><h3 className="text-2xl font-black">Add the moments that matter</h3><p className="mt-2 text-white/55">Birthdays, anniversaries, trips and family traditions will appear here.</p><Link href="/event-director" className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-white px-5 font-black text-black">Set up celebrations</Link></div>}
      </section>

      <section><SectionHeading title="Your circles" subtitle="People and interests inside SnapNext" href="/community" action="Manage" /><div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{circles.map(({ title, icon: Icon, href, tone }) => <Link key={title} href={href} className={`min-h-36 rounded-3xl border border-white/10 bg-gradient-to-br ${tone} p-4 transition-transform motion-safe:hover:-translate-y-1`}><Icon className="h-6 w-6 text-pink-100" /><h3 className="mt-5 font-black">{title}</h3><p className="mt-1 text-sm text-white/45">Open circle</p></Link>)}</div></section>

      <section><SectionHeading title="Messages" subtitle="One place for conversations and activity" href="/chat" action="Open inbox" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{messages.map(({ icon: Icon, title, detail, href }) => <Link key={title} href={href} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"><Icon className="h-6 w-6 text-purple-200" /><h3 className="mt-4 font-black">{title}</h3><p className="mt-1 text-sm leading-5 text-white/45">{detail}</p></Link>)}</div></section>

      <section><SectionHeading title="This week" subtitle="Celebrations, plans and reminders" href="/event-director" action="View all" /><div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">{events.upcoming.length ? events.upcoming.slice(0, 7).map(item => <Link href="/event-director" key={item.id} className="w-52 shrink-0 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><CalendarDays className="h-6 w-6 text-pink-200" /><p className="mt-5 text-xs font-black uppercase tracking-wider text-white/42">{item.daysUntil === 0 ? 'Today' : item.daysUntil === 1 ? 'Tomorrow' : `In ${item.daysUntil} days`}</p><h3 className="mt-2 text-lg font-black leading-6">{item.title}</h3></Link>) : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Weekend'].map(day => <Link href="/event-director" key={day} className="w-44 shrink-0 rounded-3xl border border-white/10 bg-white/[0.035] p-5"><p className="font-black">{day}</p><p className="mt-6 text-sm text-white/45">Add a plan or reminder</p></Link>)}</div></section>

      <section><SectionHeading title="Memory highlights" subtitle="Stories worth seeing again" href="/memories" /><div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">{highlights.length ? highlights.map(item => <button key={item.id} onClick={() => setSelected(item)} className="relative h-64 w-52 shrink-0 overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.04] text-left"><MemoryImage item={item} className="h-full w-full" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-5"><h3 className="line-clamp-2 text-lg font-black">{item.name || 'Memory highlight'}</h3><p className="mt-1 text-sm text-white/60">{mediaDate(item.createdAt)}</p></div></button>) : <Link href="/upload" className="flex min-h-56 w-full items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center font-bold text-white/55">Add memories to create your highlights</Link>}</div></section>

      <section><SectionHeading title="AI suggestions" subtitle="Useful actions, not another chatbot" href="/ai-studio" action="Open Create" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{aiSuggestions.map(({ title, detail, href, icon: Icon }) => <Link key={title} href={href} className="group rounded-[1.7rem] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/25 to-purple-600/20"><Icon className="h-5 w-5 text-pink-100" /></div><h3 className="mt-5 text-lg font-black">{title}</h3><p className="mt-2 text-[15px] text-white/48">{detail}</p><div className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-pink-200">Start<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div></Link>)}</div></section>

      <section className="grid gap-3 sm:grid-cols-3"><Link href="/upload" className="flex min-h-24 items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><Upload className="h-7 w-7 text-pink-200" /><div><h3 className="font-black">Add memories</h3><p className="text-sm text-white/45">Upload or import</p></div></Link><Link href="/smart-sync" className="flex min-h-24 items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><Cloud className="h-7 w-7 text-cyan-200" /><div><h3 className="font-black">Smart Backup</h3><p className="text-sm text-white/45">Check protection</p></div></Link><Link href="/settings/storage" className="flex min-h-24 items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><UserRound className="h-7 w-7 text-purple-200" /><div><h3 className="font-black">Your account</h3><p className="text-sm text-white/45">Storage and settings</p></div></Link></section>

      {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4 backdrop-blur-xl" onClick={() => setSelected(null)}><div className="mx-auto max-w-2xl pt-8" onClick={event => event.stopPropagation()}><MemoryImage item={selected} className="max-h-[62vh] w-full rounded-[2rem]" /><div className="mt-4 rounded-[2rem] border border-white/10 bg-[#0b0711] p-5"><div className="flex justify-between gap-4"><div><h3 className="text-2xl font-black">{selected.name || 'Memory'}</h3><p className="mt-1 text-white/45">{mediaDate(selected.createdAt)}</p></div><button aria-label="Close memory" onClick={() => setSelected(null)} className="grid h-11 w-11 place-items-center rounded-full bg-white/5"><X className="h-5 w-5" /></button></div><Link href="/ai-studio" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 font-black"><WandSparkles className="h-5 w-5" />Create with this memory</Link></div></div></div>}
    </div>
  );
}
