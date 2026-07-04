'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Bot,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Heart,
  Image as ImageIcon,
  Loader2,
  PenTool,
  Play,
  Search,
  Send,
  Sparkles,
  Upload,
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
  const created = new Date(item.createdAt || 0).getTime();
  if (Number.isFinite(created)) score += Math.max(0, 20 - (Date.now() - created) / (1000 * 60 * 60 * 24 * 20));
  return score;
}

function matchesQuery(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const text = [
    item.name,
    item.kind,
    item.aiAnalysis?.caption,
    item.aiAnalysis?.description,
    item.aiAnalysis?.autoAlbum,
    ...(item.aiAnalysis?.tags || []),
    ...(item.aiAnalysis?.locations || []),
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes(q);
}

function MemoryImage({ item, className = '' }) {
  if (!item) return <div className={`grid place-items-center bg-white/5 ${className}`}><ImageIcon className="h-6 w-6 text-white/30" /></div>;
  if (item.kind === 'video') {
    return (
      <div className={`relative overflow-hidden bg-white/5 ${className}`}>
        <video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted playsInline />
        <div className="absolute inset-0 grid place-items-center bg-black/25"><Play className="h-6 w-6 fill-white text-white" /></div>
      </div>
    );
  }
  if (item.kind === 'photo') return <img src={mediaSrc(item.id)} alt={item.name || 'Memory'} className={`object-cover ${className}`} />;
  return <div className={`grid place-items-center bg-white/5 ${className}`}><PenTool className="h-6 w-6 text-pink-200" /></div>;
}

function SectionHeader({ title, subtitle, action, href }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm leading-5 text-white/48">{subtitle}</p>}
      </div>
      {href && <Link href={href} className="shrink-0 text-xs font-bold text-pink-200">{action || 'Open'} <ChevronRight className="inline h-3.5 w-3.5" /></Link>}
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [media, setMedia] = useState([]);
  const [memories, setMemories] = useState(null);
  const [insights, setInsights] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [caption, setCaption] = useState('');
  const [captionLoading, setCaptionLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [me, usageData, mediaData, memoriesData, insightsData] = await Promise.all([
        apiFetch('/auth/me').catch(() => null),
        apiFetch('/storage/usage').catch(() => null),
        apiFetch('/media').catch(() => null),
        apiFetch('/memories').catch(() => null),
        apiFetch('/insights').catch(() => null),
      ]);
      if (me?.user) setUser(me.user);
      if (usageData) setUsage(usageData);
      if (mediaData?.items) setMedia(mediaData.items.filter((m) => !m.trashed));
      if (memoriesData) setMemories(memoriesData);
      if (insightsData) setInsights(insightsData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const ranked = useMemo(() => [...media].sort((a, b) => scoreMemory(b) - scoreMemory(a)), [media]);
  const recent = useMemo(() => [...media].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [media]);
  const searched = useMemo(() => ranked.filter((m) => matchesQuery(m, searchQuery)).slice(0, 12), [ranked, searchQuery]);
  const todayMemory = (memories?.onThisDay || [])[0] || ranked[0] || recent[0];
  const storyItems = ranked.slice(0, 6);
  const recentStrip = recent.slice(0, 10);
  const favorites = media.filter((m) => m.favorite || m.isFavorite);
  const taggedPlaces = ranked.filter((m) => (m.aiAnalysis?.locations || []).length || (m.aiAnalysis?.tags || []).some((t) => /trip|travel|beach|wedding|birthday|place|vacation/i.test(String(t)))).slice(0, 4);
  const analyzedCount = media.filter((m) => m.aiAnalysis?.description || (m.aiAnalysis?.tags || []).length).length;
  const usagePercent = usage && !usage.isSuper && usage.plan?.storageBytes ? Math.min(100, Math.round(((usage.usage?.bytes || 0) / usage.plan.storageBytes) * 100)) : 0;
  const storageLabel = usage?.isSuper ? 'Unlimited storage' : usage ? `${formatBytes(usage.usage?.bytes || 0)} of ${formatBytes(usage.plan?.storageBytes || 0)} used` : 'Loading storage';
  const weeklyUploads = media.filter((m) => Date.now() - new Date(m.createdAt || Date.now()).getTime() < 7 * 24 * 60 * 60 * 1000).length;

  const smartAction = insights?.duplicates?.extraCopies
    ? { title: 'Clean up duplicate memories', detail: `${insights.duplicates.extraCopies} possible duplicates are ready to review.`, href: '/health', icon: CheckCircle2 }
    : media.length
      ? { title: 'Continue your story', detail: `${Math.min(storyItems.length, 12)} real moments are ready to shape into a story.`, href: '/memories', icon: Sparkles }
      : { title: 'Back up your first memories', detail: 'Add photos and videos so SnapNext can start organizing your digital life.', href: '/upload', icon: Upload };

  async function generateCaption(item) {
    if (!item?.id) return;
    setCaption('');
    setCaptionLoading(true);
    try {
      const res = await apiFetch('/ai/caption', { method: 'POST', body: JSON.stringify({ mediaId: item.id, tone: 'warm' }) });
      setCaption(res.caption || 'Caption prepared.');
    } catch (err) {
      toast.error(err.message || 'Caption could not be generated yet.');
    } finally {
      setCaptionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5 pb-36">
        <div className="h-48 animate-pulse rounded-[2rem] bg-white/[0.04]" />
        <div className="h-32 animate-pulse rounded-3xl bg-white/[0.04]" />
        <div className="grid grid-cols-2 gap-3"><div className="h-44 animate-pulse rounded-3xl bg-white/[0.04]" /><div className="h-44 animate-pulse rounded-3xl bg-white/[0.04]" /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7 overflow-hidden pb-36 md:pb-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#261023] via-[#13081f] to-[#07151c] p-5 shadow-2xl shadow-pink-950/20 md:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="absolute -bottom-28 left-10 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-100/70">Today</p>
              <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight text-white md:text-5xl">{greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/58">Your memories are safe. SnapNext found something real from your library.</p>
            </div>
            <Link href="/favorites" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"><Heart className="h-5 w-5 text-pink-200" /></Link>
          </div>

          <Link href={smartAction.href} className="block rounded-[1.6rem] border border-pink-300/20 bg-white/[0.055] p-4 transition active:scale-[0.99]">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-pink-300/10 px-3 py-1 text-[11px] font-bold text-pink-100"><Sparkles className="h-3.5 w-3.5" /> SnapNext found this for you</div>
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600"><smartAction.icon className="h-5 w-5 text-white" /></div>
              <div className="min-w-0 flex-1"><h2 className="text-xl font-black text-white">{smartAction.title}</h2><p className="mt-1 text-sm leading-5 text-white/55">{smartAction.detail}</p></div>
              <ChevronRight className="h-5 w-5 text-white/45" />
            </div>
          </Link>

          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-pink-200" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search your memories" className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 pl-12 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-pink-300/40" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {['Beach photos', 'Birthday', 'Family', 'Wedding', 'Favorites'].map((s) => <button key={s} onClick={() => setSearchQuery(s)} className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/65">{s}</button>)}
          </div>
        </div>
      </section>

      {searchQuery && (
        <section>
          <SectionHeader title="Search results" subtitle="Real matches from your saved library" />
          {searched.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{searched.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] text-left"><MemoryImage item={item} className="aspect-square w-full" /><div className="p-3"><p className="truncate text-sm font-bold text-white">{item.name}</p><p className="mt-1 text-xs text-white/42">{mediaDate(item.createdAt)}</p></div></button>)}</div> : <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-sm text-white/55">Nothing found yet. Try another word or upload more memories.</div>}
        </section>
      )}

      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035]">
        <div className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-white/38">Today in your life</p>
          <h2 className="mt-1 text-2xl font-black text-white">{todayMemory ? todayMemory.name : 'No memories yet'}</h2>
        </div>
        {todayMemory ? <button onClick={() => setSelected(todayMemory)} className="block w-full text-left"><MemoryImage item={todayMemory} className="h-64 w-full" /></button> : <Link href="/upload" className="grid h-48 place-items-center bg-white/[0.025] text-white/55">Back up photos and videos to begin.</Link>}
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-pink-500/10 to-purple-600/10 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600"><Bot className="h-5 w-5 text-white" /></div>
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-pink-100/70">A gentle observation</p><h2 className="mt-1 text-xl font-black text-white">{analyzedCount ? `${analyzedCount} memories have useful AI signals` : 'SnapNext is ready to learn your memories'}</h2><p className="mt-1 text-sm leading-5 text-white/55">{analyzedCount ? 'Descriptions, tags, favorites and dates help SnapNext find better moments for you.' : 'Upload a few photos or videos and SnapNext will start organizing them privately.'}</p></div>
        </div>
      </section>

      <section>
        <SectionHeader title="Continue your story" subtitle="Best real moments from your library" action="See all" href="/memories" />
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {storyItems.length ? storyItems.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="w-40 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] text-left"><MemoryImage item={item} className="h-44 w-full" /><div className="p-3"><p className="truncate text-sm font-black text-white">{item.name}</p><p className="mt-1 truncate text-xs text-white/45">{item.aiAnalysis?.autoAlbum || mediaDate(item.createdAt) || 'Saved memory'}</p></div></button>) : <Link href="/upload" className="w-64 shrink-0 rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-sm text-white/55">Your first story starts with one memory.</Link>}
        </div>
      </section>

      <section>
        <SectionHeader title="Trips & places" subtitle="Only shown when your real media has place or event signals" href="/memories" />
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {(taggedPlaces.length ? taggedPlaces : ranked.slice(0, 2)).map((item) => <button key={item.id} onClick={() => setSelected(item)} className="w-72 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] text-left"><MemoryImage item={item} className="h-40 w-full" /><div className="p-4"><h3 className="truncate text-lg font-black text-white">{item.name}</h3><p className="mt-1 line-clamp-2 text-sm text-white/48">{item.aiAnalysis?.description || item.aiAnalysis?.autoAlbum || mediaDate(item.createdAt) || 'Saved memory'}</p></div></button>)}
        </div>
      </section>

      <section>
        <SectionHeader title="Recent moments" subtitle={`${media.length} saved items`} action="Open gallery" href="/gallery" />
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {recentStrip.length ? recentStrip.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="relative h-28 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]"><MemoryImage item={item} className="h-full w-full" />{(item.favorite || item.isFavorite) && <Heart className="absolute right-2 top-2 h-4 w-4 fill-pink-300 text-pink-300" />}</button>) : <Link href="/upload" className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/55">No recent memories yet.</Link>}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <SectionHeader title="Capture something new" subtitle="Quick actions only — no heavy form on Home" />
        <div className="grid grid-cols-3 gap-3">
          <Link href="/journal" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm font-bold text-white"><PenTool className="mx-auto mb-2 h-5 w-5 text-cyan-200" />Thought</Link>
          <Link href="/upload" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm font-bold text-white"><Cloud className="mx-auto mb-2 h-5 w-5 text-pink-200" />Back up</Link>
          <Link href="/chat" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm font-bold text-white"><Send className="mx-auto mb-2 h-5 w-5 text-purple-200" />Ask</Link>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Storage</p><p className="mt-1 text-sm font-semibold text-white/70">{storageLabel}</p></div>{!usage?.isSuper && <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" style={{ width: `${usagePercent}%` }} /></div>}</div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-xl" onClick={() => setSelected(null)}>
          <div className="mx-auto max-w-2xl pt-8" onClick={(e) => e.stopPropagation()}>
            <MemoryImage item={selected} className="max-h-[62vh] w-full rounded-[2rem]" />
            <div className="mt-4 rounded-[2rem] border border-white/10 bg-[#0b0711] p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-black text-white">{selected.name}</h3><p className="mt-1 text-sm text-white/45">{mediaDate(selected.createdAt)}</p></div><button onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><X className="h-5 w-5" /></button></div>
              {selected.aiAnalysis?.description && <p className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-sm leading-6 text-white/65">{selected.aiAnalysis.description}</p>}
              <button onClick={() => generateCaption(selected)} disabled={captionLoading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-4 text-sm font-black text-white disabled:opacity-60">{captionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate AI caption</button>
              {caption && <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-pink-300/20 bg-pink-300/10 p-4 text-sm leading-6 text-pink-50">{caption}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
