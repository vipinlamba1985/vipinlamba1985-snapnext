'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc, thumbnailSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Search, Heart, Trash2, Download, Star, CheckCircle2, Film, FileText, Camera,
  MapPin, Users, CalendarDays, Sparkles, ChevronRight, X, Cloud, Play,
  WandSparkles, ShieldCheck, Gift, CircleAlert, Images, Upload, SlidersHorizontal,
} from 'lucide-react';

const FILTERS = [['all', 'All'], ['photo', 'Photos'], ['video', 'Videos'], ['favorite', 'Favorites']];
const BUILD_MARK = 'Gallery UX v2';

function safe(value) { return value && typeof value === 'object' ? value : {}; }
function dateLabel(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
}
function daysLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return Number.isFinite(days) ? `In ${days} days` : 'Coming up';
}

export default function GalleryPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [events, setEvents] = useState({ upcoming: [], incompleteProfiles: [], drafts: [] });

  async function load({ append = false, cursor = '' } = {}) {
    append ? setLoadingMore(true) : setLoading(true);
    setLoadError('');
    if (!append) {
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
    }
    const params = new URLSearchParams({ filter, limit: '48' });
    if (search) params.set('q', search);
    if (cursor) params.set('cursor', cursor);
    try {
      const [mediaData, eventData] = await Promise.all([
        apiFetch(`/media?${params}`),
        append ? Promise.resolve(null) : apiFetch('/life-event-director').catch(() => null),
      ]);
      const m = safe(mediaData);
      const incoming = Array.isArray(m.items) ? m.items : [];
      setItems(current => {
        if (!append) return incoming;
        const existing = new Set(current.map(item => item.id));
        return [...current, ...incoming.filter(item => !existing.has(item.id))];
      });
      setNextCursor(m.nextCursor || null);
      setHasMore(Boolean(m.hasMore && m.nextCursor));
      if (eventData) {
        const e = safe(eventData);
        setEvents({
          upcoming: Array.isArray(e.upcoming) ? e.upcoming : [],
          incompleteProfiles: Array.isArray(e.incompleteProfiles) ? e.incompleteProfiles : [],
          drafts: Array.isArray(e.drafts) ? e.drafts : [],
        });
      }
    } catch (error) {
      const message = error.message || 'Gallery could not load.';
      setLoadError(message);
      if (!append) toast.error(message);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter, search]);

  const stats = useMemo(() => ({
    photos: items.filter(x => x.kind === 'photo').length,
    videos: items.filter(x => x.kind === 'video').length,
    favorites: items.filter(x => x.favorite || x.isFavorite).length,
    documents: items.filter(x => x.kind === 'text' || /doc|receipt|scan/i.test(x.name || '')).length,
    places: new Set(items.flatMap(x => x.aiAnalysis?.locations || [])).size,
  }), [items]);

  const people = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      for (const face of item.aiAnalysis?.faces || []) {
        const name = String(face || '').trim();
        if (!name) continue;
        const entry = map.get(name) || { name, count: 0, sample: null };
        entry.count += 1;
        if (!entry.sample && item.kind === 'photo') entry.sample = item.id;
        map.set(name, entry);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [items]);

  const heroEvent = events.upcoming[0] || null;
  const profilePrompt = events.incompleteProfiles[0] || null;
  const recent = items.slice(0, 8);
  const continueItems = [
    heroEvent && { title: heroEvent.title, detail: `${daysLabel(heroEvent.daysUntil)} · celebration package`, href: '/event-director', icon: Gift },
    events.drafts[0] && { title: events.drafts[0].title || 'Prepared celebration', detail: 'Continue reviewing your draft', href: '/event-director', icon: WandSparkles },
    items.length && { title: 'Create a memory story', detail: `${Math.min(items.length, 12)} moments are ready`, href: '/ai-studio', icon: Sparkles },
  ].filter(Boolean).slice(0, 3);

  const submitSearch = value => setSearch(String(value ?? query).trim());
  const chooseCollection = (kind, term = '') => { setFilter(kind); setQuery(term); setSearch(term); };
  const toggle = id => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const favorite = async id => { await apiFetch(`/media/${id}/favorite`, { method: 'POST' }); await load(); };
  const trash = async id => { await apiFetch(`/media/${id}/trash`, { method: 'POST' }); setViewer(null); await load(); toast.success('Moved to trash.'); };
  const download = async item => {
    const response = await fetch(mediaSrc(item.id));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = item.name || 'memory'; anchor.click(); URL.revokeObjectURL(url);
  };
  const bulk = async action => {
    if (!selected.size) return;
    await apiFetch('/media/bulk', { method: 'POST', body: JSON.stringify({ ids: [...selected], action }) });
    setSelected(new Set()); await load(); toast.success('Gallery updated.');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-32 md:pb-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#351329] via-[#160a22] to-[#07161d] p-5 md:p-8">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-pink-200/80">{BUILD_MARK}</p><h1 className="mt-2 text-4xl font-black md:text-6xl">Gallery</h1><p className="mt-2 text-lg leading-7 text-white/62">Your people, events and memories — clearly organized.</p></div>
            <Link href="/upload" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600"><Upload className="h-6 w-6" /></Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3"><Stat value={items.length} label="Memories" /><Stat value={stats.videos} label="Videos" /><Stat value={stats.favorites} label="Favorites" /></div>
          <div className="relative mt-5"><Search className="absolute left-4 top-4 h-6 w-6 text-pink-200" /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitSearch()} placeholder="Search people, places, birthdays…" className="h-16 w-full rounded-2xl border border-white/10 bg-black/30 pl-13 pr-28 text-lg outline-none placeholder:text-white/35" /><button onClick={() => submitSearch()} className="absolute right-2 top-2 h-12 rounded-xl bg-white px-5 text-base font-black text-black">Search</button></div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.08fr_.92fr]">
        <div className="rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-purple-700/25 via-pink-500/15 to-transparent p-5">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-pink-200">Today’s priority</p>
          <div className="mt-3 flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-pink-400/60 bg-pink-500/15"><Gift className="h-8 w-8 text-pink-100" /></div><div><h2 className="text-2xl font-black">{heroEvent?.title || 'Create something meaningful'}</h2><p className="mt-1 text-base leading-6 text-white/55">{heroEvent ? `${daysLabel(heroEvent.daysUntil)} · Reel, collage, card and Story ready to prepare.` : 'Turn recent memories into a story, reel or collage.'}</p></div></div>
          <div className="mt-5 grid grid-cols-4 gap-2">{['Reel', 'Collage', 'Card', 'Story'].map(x => <div key={x} className="rounded-2xl bg-white/[0.06] px-2 py-3 text-center text-sm font-bold">{x}</div>)}</div>
          <Link href={heroEvent ? '/event-director' : '/ai-studio'} className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-base font-black">View suggestions</Link>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Continue" subtitle="Pick up where you left off" />{continueItems.length ? <div className="space-y-3">{continueItems.map(({ title, detail, href, icon: Icon }) => <Link key={title} href={href} className="flex items-center gap-3 rounded-2xl bg-white/[0.045] p-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/8"><Icon className="h-5 w-5 text-pink-200" /></div><div className="min-w-0"><div className="truncate text-base font-black">{title}</div><div className="truncate text-sm text-white/45">{detail}</div></div><ChevronRight className="ml-auto h-5 w-5 text-white/35" /></Link>)}</div> : <p className="text-base text-white/50">Your next project will appear here.</p>}</div>
      </section>

      <section><SectionTitle title="Explore" subtitle="Everything important, without empty space" /><div className="grid grid-cols-4 gap-2 md:grid-cols-8">{[
        [Users, 'People', `${people.length}`, () => document.getElementById('people')?.scrollIntoView({ behavior: 'smooth' })],
        [MapPin, 'Places', `${stats.places}`, () => chooseCollection('all', 'travel')],
        [CalendarDays, 'Events', 'View', () => chooseCollection('all', 'birthday')],
        [Heart, 'Favorites', `${stats.favorites}`, () => chooseCollection('favorite')],
        [Camera, 'Photos', `${stats.photos}`, () => chooseCollection('photo')],
        [Film, 'Videos', `${stats.videos}`, () => chooseCollection('video')],
        [FileText, 'Docs', `${stats.documents}`, () => chooseCollection('all', 'document')],
        [WandSparkles, 'AI', 'Create', () => location.assign('/ai-studio')],
      ].map(([Icon, title, detail, action]) => <button key={title} onClick={action} className="min-h-28 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-center"><Icon className="mx-auto h-6 w-6 text-pink-200" /><div className="mt-3 text-sm font-black">{title}</div><div className="mt-1 text-xs text-white/42">{detail}</div></button>)}</div></section>

      {people.length > 0 && <section id="people"><div className="flex items-end justify-between"><SectionTitle title="People" subtitle="Larger portraits so faces are easy to recognize" /><button onClick={() => chooseCollection('all')} className="mb-4 text-sm font-bold text-pink-200">View all</button></div><div className="flex gap-5 overflow-x-auto pb-3 no-scrollbar">{people.map(person => <button key={person.name} onClick={() => { setQuery(person.name); submitSearch(person.name); }} className="w-36 shrink-0 text-center"><div className="mx-auto h-32 w-32 overflow-hidden rounded-full border-4 border-pink-400/70 bg-white/5 shadow-xl shadow-pink-950/30">{person.sample ? <img src={mediaSrc(person.sample)} className="h-full w-full origin-top scale-[2.25] object-cover" style={{ objectPosition: '50% 18%' }} alt="" /> : <Users className="m-auto h-full w-10 text-white/30" />}</div><div className="mt-3 truncate text-lg font-black">{person.name}</div><div className="text-sm text-white/42">{person.count} memories</div></button>)}</div></section>}

      {recent.length > 0 && <section><SectionTitle title="Recent memories" subtitle="Large previews with useful context" /><div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar">{recent.map(item => <button key={item.id} onClick={() => setViewer(item)} className="w-48 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] text-left"><Media item={item} className="h-52 w-full" preview /><div className="p-3"><div className="truncate text-base font-black">{item.name || 'Memory'}</div><div className="mt-1 text-sm text-white/42">{dateLabel(item.createdAt)}</div></div></button>)}</div></section>}

      <section><SectionTitle title="Gallery health" subtitle="Use your space wisely" /><div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Health href="/health" icon={ShieldCheck} title="Duplicates" detail="Review" /><Health href="/health" icon={Images} title="Blurry photos" detail="Review" /><Health href="/health" icon={Film} title="Large videos" detail="Review" /><Health href="/smart-sync" icon={Cloud} title="Backups" detail="Check now" /><Health href="/event-director" icon={CircleAlert} title="Profiles" detail={profilePrompt ? `${profilePrompt.completeness?.percent || 0}% ready` : 'Ready'} /></div></section>

      <section><div className="flex items-end justify-between"><SectionTitle title="Your timeline" subtitle={`${items.length} memories shown`} /><SlidersHorizontal className="mb-4 h-6 w-6 text-white/45" /></div><div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">{FILTERS.map(([id, title]) => <button key={id} onClick={() => setFilter(id)} className={`min-h-12 shrink-0 rounded-full px-5 text-base font-black ${filter === id ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'border border-white/10 bg-white/5 text-white/65'}`}>{title}</button>)}</div>{selected.size > 0 && <div className="sticky top-3 z-30 mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0414]/95 p-3"><span className="text-base font-black">{selected.size} selected</span><div className="ml-auto flex gap-2"><button onClick={() => bulk('favorite')} className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold">Favorite</button><button onClick={() => bulk('trash')} className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold">Trash</button><button onClick={() => setSelected(new Set())} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5"><X className="h-4 w-4" /></button></div></div>}{loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-white/[0.04]" />)}</div> : items.length === 0 ? <Empty /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">{items.map(item => <MemoryCard key={item.id} item={item} selected={selected.has(item.id)} onSelect={() => toggle(item.id)} onOpen={() => setViewer(item)} />)}</div>}{loadError && <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-center"><p className="text-sm text-rose-100">{loadError}</p><button onClick={() => load({ append: items.length > 0, cursor: items.length > 0 ? nextCursor : '' })} className="mt-3 min-h-11 rounded-xl bg-white px-5 text-sm font-black text-black">Try again</button></div>}{!loading && !loadError && hasMore && <button onClick={() => load({ append: true, cursor: nextCursor })} disabled={loadingMore} className="mt-5 min-h-12 w-full rounded-2xl border border-white/10 bg-white/5 text-base font-black disabled:opacity-60">{loadingMore ? 'Loading more…' : 'Load more memories'}</button>}{!loading && !loadError && items.length > 0 && !hasMore && <p className="mt-5 text-center text-sm text-white/40">You reached the end of your gallery.</p>}</section>

      {viewer && <Viewer item={viewer} onClose={() => setViewer(null)} onFavorite={() => favorite(viewer.id)} onDownload={() => download(viewer)} onTrash={() => trash(viewer.id)} />}
    </div>
  );
}

function Media({ item, className = '', preview = false }) { const source = preview ? thumbnailSrc(item.id) : mediaSrc(item.id); return item.kind === 'photo' ? <img src={source} loading={preview ? 'lazy' : 'eager'} decoding="async" className={`${className} object-cover`} alt={item.name || 'Memory'} /> : item.kind === 'video' ? <div className={`relative ${className}`}><video src={preview ? undefined : source} poster={preview ? thumbnailSrc(item.id) : undefined} preload={preview ? 'none' : 'metadata'} className="h-full w-full object-cover" muted playsInline /><div className="absolute inset-0 grid place-items-center bg-black/20"><Play className="h-8 w-8 fill-white" /></div></div> : <div className={`grid place-items-center bg-white/5 p-4 text-center ${className}`}><FileText className="h-8 w-8" /></div>; }
function Stat({ value, label }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-sm text-white/48">{label}</div></div>; }
function SectionTitle({ title, subtitle }) { return <div className="mb-4"><h2 className="text-2xl font-black md:text-3xl">{title}</h2>{subtitle && <p className="mt-1 text-base leading-6 text-white/48">{subtitle}</p>}</div>; }
function Health({ href, icon: Icon, title, detail }) { return <Link href={href} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><Icon className="h-6 w-6 text-pink-200" /><div className="mt-4 text-base font-black">{title}</div><div className="mt-1 text-sm text-white/45">{detail}</div></Link>; }
function MemoryCard({ item, selected, onSelect, onOpen }) { return <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"><button onClick={onOpen} className="relative block aspect-[4/5] w-full overflow-hidden"><Media item={item} className="h-full w-full" preview />{(item.favorite || item.isFavorite) && <Star className="absolute right-3 top-3 h-5 w-5 fill-amber-300 text-amber-300" />}</button><div className="flex items-center gap-3 p-3"><button onClick={onSelect} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${selected ? 'border-pink-500 bg-pink-500' : 'border-white/20 bg-white/5'}`}>{selected && <CheckCircle2 className="h-5 w-5" />}</button><div className="min-w-0"><div className="truncate text-base font-black">{item.name || 'Memory'}</div><div className="text-sm text-white/42">{dateLabel(item.createdAt)}</div></div></div></div>; }
function Viewer({ item, onClose, onFavorite, onDownload, onTrash }) { return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/95 p-3 backdrop-blur-xl" onClick={onClose}><div className="mx-auto grid min-h-full max-w-5xl place-items-center" onClick={e => e.stopPropagation()}><div className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0711]"><div className="relative grid min-h-[45vh] place-items-center bg-black"><Media item={item} className="max-h-[72vh] w-full" /><button onClick={onClose} className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full bg-black/60"><X className="h-5 w-5" /></button></div><div className="p-5"><h2 className="text-2xl font-black">{item.name || 'Memory'}</h2><p className="mt-1 text-base text-white/45">{dateLabel(item.createdAt)}</p><div className="mt-5 grid grid-cols-3 gap-3"><Action icon={Heart} label="Favorite" onClick={onFavorite} /><Action icon={Download} label="Download" onClick={onDownload} /><Action icon={Trash2} label="Trash" onClick={onTrash} /></div></div></div></div></div>; }
function Action({ icon: Icon, label, onClick }) { return <button onClick={onClick} className="min-h-20 rounded-2xl border border-white/10 bg-white/5 text-base font-bold"><Icon className="mx-auto mb-2 h-5 w-5" />{label}</button>; }
function Empty() { return <Link href="/upload" className="block rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] p-10 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600"><Images className="h-7 w-7" /></div><h3 className="mt-4 text-2xl font-black">Your gallery is ready</h3><p className="mt-2 text-base text-white/50">Upload photos and videos to begin.</p></Link>; }
