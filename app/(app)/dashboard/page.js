'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import {
  BookOpen, ChevronRight, Cloud, Heart, Image as ImageIcon, MessageCircle,
  PenTool, Play, Sparkles, Upload, X,
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

function yearsAgo(value) {
  if (!value) return null;
  const year = new Date(value).getFullYear();
  if (!Number.isFinite(year)) return null;
  const diff = new Date().getFullYear() - year;
  return diff > 0 ? diff : null;
}

function formatStorage(bytes) {
  const gb = Number(bytes || 0) / (1024 ** 3);
  if (gb >= 10) return `${Math.round(gb)} GB`;
  return `${gb.toFixed(gb >= 1 ? 1 : 2)} GB`;
}

function MemoryImage({ item, className = '' }) {
  if (!item) return <div className={`grid place-items-center bg-white/5 ${className}`}><ImageIcon className="h-7 w-7 text-white/30" /></div>;
  if (item.kind === 'video') return <div className={`relative overflow-hidden bg-white/5 ${className}`}><video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted playsInline preload="metadata" /><div className="absolute inset-0 grid place-items-center bg-black/25"><Play className="h-8 w-8 fill-white" /></div></div>;
  if (item.kind === 'photo') return <img src={mediaSrc(item.id)} loading="lazy" decoding="async" alt={item.name || 'Memory'} className={`object-cover ${className}`} />;
  return <div className={`grid place-items-center bg-white/5 ${className}`}><PenTool className="h-7 w-7 text-pink-200" /></div>;
}

function SectionHeading({ title, href, action }) {
  return <div className="mb-3 flex items-center justify-between gap-4"><h2 className="text-[22px] font-black tracking-tight">{title}</h2>{href && <Link data-testid={`home-${title.toLowerCase().replaceAll(' ', '-')}-action`} href={href} className="inline-flex min-h-10 items-center gap-1 rounded-full px-2 text-sm font-bold text-pink-200">{action || 'See all'}<ChevronRight className="h-4 w-4" /></Link>}</div>;
}

function normalizeEvents(value) {
  return {
    upcoming: Array.isArray(value?.upcoming) ? value.upcoming : [],
    memorySuggestions: Array.isArray(value?.memorySuggestions) ? value.memorySuggestions : [],
    setupPrompts: Array.isArray(value?.setupPrompts) ? value.setupPrompts : [],
  };
}

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

  const recent = useMemo(() => [...media]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 12), [media]);
  const onThisDay = Array.isArray(memories?.onThisDay) ? memories.onThisDay : [];
  const todayMemory = onThisDay[0] || null;
  const storyItems = Array.isArray(memories?.stories) ? memories.stories.filter(item => item?.id).slice(0, 8) : [];
  const firstName = user?.name?.split(' ')[0] || '';
  const duplicateCount = Number(insights?.duplicates?.extraCopies || 0);

  const smartAction = useMemo(() => {
    const event = events.upcoming.find(item => Number(item.daysUntil) <= 3) || events.upcoming[0];
    if (event) return {
      title: event.title,
      reason: Number(event.daysUntil) === 0 ? 'A meaningful date is here today.' : `Coming up in ${event.daysUntil} day${Number(event.daysUntil) === 1 ? '' : 's'}.`,
      href: '/event-director',
      cta: 'Prepare it',
    };
    if (events.memorySuggestions[0]) return {
      title: events.memorySuggestions[0].question || 'A memory may be worth marking',
      reason: events.memorySuggestions[0].evidence || 'SnapNext noticed a pattern in your memories.',
      href: '/event-director',
      cta: 'Review suggestion',
    };
    if (events.setupPrompts[0]) return {
      title: events.setupPrompts[0].title || 'Add a little more context',
      reason: events.setupPrompts[0].detail || 'A few details can make future memories more meaningful.',
      href: events.setupPrompts[0].href || '/event-director',
      cta: 'Add details',
    };
    if (todayMemory) return {
      title: 'Rediscover this day',
      reason: `${onThisDay.length} memor${onThisDay.length === 1 ? 'y' : 'ies'} from this date are ready to revisit.`,
      href: '/memories',
      cta: 'Open collection',
    };
    if (duplicateCount > 0) return {
      title: 'Make a little room',
      reason: `${duplicateCount} duplicate cop${duplicateCount === 1 ? 'y' : 'ies'} can be reviewed safely.`,
      href: '/health',
      cta: 'Review duplicates',
    };
    if (recent.length > 0) return {
      title: 'Your recent moments are together',
      reason: `${recent.length} recent memor${recent.length === 1 ? 'y is' : 'ies are'} ready in your library.`,
      href: '/gallery',
      cta: 'Open Library',
    };
    return null;
  }, [duplicateCount, events, onThisDay.length, recent.length, todayMemory]);

  const observation = useMemo(() => {
    if (insights?.mostPhotographed?.count > 0) return {
      title: `${insights.mostPhotographed.label} holds a lot of your story`,
      detail: `${insights.mostPhotographed.count} memories were captured in that period.`,
      href: '/memories',
      action: 'See the collection',
    };
    if (insights?.thisMonth?.count > 0) return {
      title: `You added ${insights.thisMonth.count} memories this month`,
      detail: 'Small moments are already building into a bigger story.',
      href: '/gallery',
      action: 'See recent moments',
    };
    return null;
  }, [insights]);

  const storageBytes = Number(insights?.totals?.bytes || 0);
  const storageLimit = Number(insights?.plan?.storageBytes || 0);
  const storagePct = insights?.plan?.isSuper || !storageLimit ? 0 : Math.min(100, Math.round((storageBytes / storageLimit) * 100));

  if (loading) return <div className="mx-auto max-w-5xl space-y-6 pb-32" aria-label="Loading Home"><div className="h-20 animate-pulse rounded-3xl bg-white/[0.04]" /><div className="h-52 animate-pulse rounded-[2rem] bg-white/[0.04]" /><div className="h-64 animate-pulse rounded-[2rem] bg-white/[0.04]" /><div className="h-28 animate-pulse rounded-3xl bg-white/[0.04]" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-32 md:pb-12">
      <header data-testid="home-personal-header" className="flex items-center gap-3">
        <Link data-testid="home-avatar-link" href="/settings" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-black ring-1 ring-white/15" style={{ background: user?.avatarColor || '#a855f7' }}>{user?.name?.[0]?.toUpperCase() || 'U'}</Link>
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white/45">{readableDate()}</p><h1 className="truncate text-[26px] font-black tracking-tight">{greeting()}{firstName ? `, ${firstName}` : ''}</h1><p className="mt-0.5 text-sm text-white/48">Your memories are safe. SnapNext found something for you.</p></div>
        <Link data-testid="home-trusted-circle-link" href="/trusted-circle" aria-label="Open your trusted circle" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04]"><Heart className="h-5 w-5 text-pink-200" /></Link>
      </header>

      <section data-testid="home-primary-action" className="relative overflow-hidden rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-pink-500/16 via-purple-500/12 to-cyan-500/8 p-5 md:p-7">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-pink-500/15 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-pink-100"><Sparkles className="h-3.5 w-3.5" />SnapNext found this for you</div>
          {smartAction ? <><h2 className="mt-4 max-w-2xl text-2xl font-black leading-tight md:text-3xl">{smartAction.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55 md:text-base">{smartAction.reason}</p><Link data-testid="home-primary-action-cta" href={smartAction.href} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-black text-black">{smartAction.cta}</Link></> : <><h2 className="mt-4 text-2xl font-black">SnapNext is getting to know your memories</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Add a few more moments and useful stories will start to form.</p><Link data-testid="home-primary-action-cta" href="/upload" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-black text-black">Add memories</Link></>}
        </div>
      </section>

      <section data-testid="home-today-memory">
        <SectionHeading title="Today in your life" href="/memories" action="See all" />
        {todayMemory ? <button data-testid="home-today-memory-card" onClick={() => setSelected(todayMemory)} className="relative block h-64 w-full overflow-hidden rounded-[2rem] border border-white/10 text-left md:h-72"><MemoryImage item={todayMemory} className="h-full w-full" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" /><div className="absolute inset-x-0 bottom-0 p-5 md:p-6"><div className="inline-flex rounded-full bg-purple-500/75 px-3 py-1 text-xs font-black">This day{yearsAgo(todayMemory.createdAt) ? ` · ${yearsAgo(todayMemory.createdAt)} years ago` : ''}</div><h3 className="mt-3 line-clamp-2 text-2xl font-black">{todayMemory.name || 'A memory worth revisiting'}</h3><p className="mt-1 text-sm text-white/65">{onThisDay.length} photo{onThisDay.length === 1 ? '' : 's'} worth revisiting</p></div></button> : <Link data-testid="home-today-memory-empty" href="/upload" className="flex min-h-40 items-center justify-center rounded-[2rem] border border-dashed border-white/12 bg-white/[0.025] p-6 text-center text-sm font-semibold text-white/48">As your library grows, memories from this day will appear here.</Link>}
      </section>

      <section data-testid="home-observation" className="flex items-center gap-4 rounded-3xl border border-white/8 bg-white/[0.035] p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/25 to-purple-500/20"><Heart className="h-5 w-5 text-pink-100" /></div>
        <div className="min-w-0 flex-1">{observation ? <><h2 className="font-black">{observation.title}</h2><p className="mt-1 text-sm leading-5 text-white/45">{observation.detail}</p></> : <><h2 className="font-black">Patterns will appear naturally</h2><p className="mt-1 text-sm leading-5 text-white/45">SnapNext will start noticing patterns as more memories are added.</p></>}</div>
        {observation && <Link data-testid="home-observation-action" href={observation.href} aria-label={observation.action} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5"><ChevronRight className="h-5 w-5 text-white/55" /></Link>}
      </section>

      {storyItems.length > 0 && <section data-testid="home-story-carousel"><SectionHeading title="Continue your story" href="/memories" action="See all" /><div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">{storyItems.map(item => <Link data-testid={`home-story-${item.id}`} key={item.id} href="/memories" className="relative h-52 w-40 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"><MemoryImage item={item} className="h-full w-full" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4"><h3 className="line-clamp-2 font-black">{item.title || item.name || 'Your story'}</h3>{item.count && <p className="mt-1 text-xs text-white/60">{item.count} moments</p>}</div></Link>)}</div></section>}

      <section data-testid="home-recent-moments">
        <SectionHeading title="Recent moments" href="/gallery" action="Open Library" />
        {recent.length ? <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">{recent.map(item => <button data-testid={`home-recent-${item.id}`} key={item.id} onClick={() => setSelected(item)} className="relative h-28 w-[92px] shrink-0 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"><MemoryImage item={item} className="h-full w-full" />{(item.favorite || item.isFavorite) && <Heart className="absolute right-2 top-2 h-4 w-4 fill-pink-400 text-pink-400 drop-shadow" />}{item.kind === 'video' && <span className="absolute bottom-2 left-2 rounded-full bg-black/65 p-1"><Play className="h-3 w-3 fill-white" /></span>}</button>)}</div> : <Link data-testid="home-recent-empty" href="/upload" className="block rounded-3xl border border-dashed border-white/12 bg-white/[0.025] p-5 text-sm font-semibold text-white/48">Back up your first moments to see them here.</Link>}
      </section>

      <section data-testid="home-capture-actions">
        <SectionHeading title="Capture something new" />
        <div className="grid grid-cols-3 gap-2">
          <Link data-testid="home-capture-thought" href="/journal" className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.035] text-sm font-bold"><BookOpen className="h-5 w-5 text-cyan-200" />Thought</Link>
          <Link data-testid="home-capture-backup" href="/upload" className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.035] text-sm font-bold"><Upload className="h-5 w-5 text-pink-200" />Back up</Link>
          <Link data-testid="home-capture-ask" href="/chat" className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.035] text-sm font-bold"><MessageCircle className="h-5 w-5 text-purple-200" />Ask</Link>
        </div>
      </section>

      {insights?.plan && <section data-testid="home-storage" className="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3"><Cloud className="h-5 w-5 shrink-0 text-cyan-200" /><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Storage</p><p className="mt-1 truncate text-sm font-semibold text-white/60">{insights.plan.isSuper ? `${formatStorage(storageBytes)} protected · Unlimited plan` : `${formatStorage(storageBytes)} of ${formatStorage(storageLimit)} used`}</p></div>{!insights.plan.isSuper && <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${storagePct}%` }} /></div>}</section>}

      {selected && <div data-testid="home-memory-viewer" className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4 backdrop-blur-xl" onClick={() => setSelected(null)}><div className="mx-auto max-w-2xl pt-8" onClick={event => event.stopPropagation()}><MemoryImage item={selected} className="max-h-[62vh] w-full rounded-[2rem]" /><div className="mt-4 rounded-[2rem] border border-white/10 bg-[#0b0711] p-5"><div className="flex justify-between gap-4"><div><h3 className="text-2xl font-black">{selected.name || 'Memory'}</h3><p className="mt-1 text-white/45">{mediaDate(selected.createdAt)}</p></div><button data-testid="home-memory-viewer-close" aria-label="Close memory" onClick={() => setSelected(null)} className="grid h-11 w-11 place-items-center rounded-full bg-white/5"><X className="h-5 w-5" /></button></div><Link data-testid="home-memory-create" href="/ai-studio" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 font-black"><Sparkles className="h-5 w-5" />Create with this memory</Link></div></div></div>}
    </div>
  );
}
