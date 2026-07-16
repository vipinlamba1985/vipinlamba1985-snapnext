'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Search, Heart, Trash2, Download, Star, CheckCircle2, Image as ImageIcon,
  Film, FileText, Camera, MapPin, Users, CalendarDays, Sparkles, ChevronRight,
  X, Cloud, Play, WandSparkles, ShieldCheck, Clock3, Gift, FolderHeart,
  SlidersHorizontal, CircleAlert, Images, Upload,
} from 'lucide-react';

const FILTERS = [
  ['all', 'All memories'], ['photo', 'Photos'], ['video', 'Videos'], ['favorite', 'Favorites'],
];

function normalize(value) {
  return value && typeof value === 'object' ? value : {};
}

function dateLabel(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  } catch {
    return '';
  }
}

function daysLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (Number.isFinite(days)) return `${days} days`;
  return 'Coming up';
}

export default function GalleryPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState({ upcoming: [], incompleteProfiles: [], drafts: [] });

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ filter });
    if (search) params.set('q', search);
    try {
      const [mediaData, events] = await Promise.all([
        apiFetch(`/media?${params}`).catch(() => null),
        apiFetch('/life-event-director').catch(() => null),
      ]);
      const safeMedia = normalize(mediaData);
      const safeEvents = normalize(events);
      setItems(Array.isArray(safeMedia.items) ? safeMedia.items : []);
      setEventData({
        upcoming: Array.isArray(safeEvents.upcoming) ? safeEvents.upcoming : [],
        incompleteProfiles: Array.isArray(safeEvents.incompleteProfiles) ? safeEvents.incompleteProfiles : [],
        drafts: Array.isArray(safeEvents.drafts) ? safeEvents.drafts : [],
      });
    } catch (error) {
      toast.error(error.message || 'Gallery could not load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter, search]);

  const stats = useMemo(() => ({
    photos: items.filter(item => item.kind === 'photo').length,
    videos: items.filter(item => item.kind === 'video').length,
    favorites: items.filter(item => item.favorite || item.isFavorite).length,
    documents: items.filter(item => item.kind === 'text' || /doc|receipt|scan/i.test(item.name || '')).length,
    places: new Set(items.flatMap(item => item.aiAnalysis?.locations || [])).size,
    analyzed: items.filter(item => item.aiAnalysis?.description || (item.aiAnalysis?.tags || []).length).length,
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
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [items]);

  const heroEvent = eventData.upcoming[0] || null;
  const profilePrompt = eventData.incompleteProfiles[0] || null;
  const continueItems = [
    heroEvent && { title: heroEvent.title, detail: `${daysLabel(heroEvent.daysUntil)} · prepare celebration content`, href: '/event-director', icon: Gift },
    eventData.drafts[0] && { title: eventData.drafts[0].title || 'Celebration package', detail: 'Continue reviewing your prepared content', href: '/event-director', icon: WandSparkles },
    items.length > 0 && { title: 'Create a memory story', detail: `${Math.min(items.length, 12)} recent memories are ready`, href: '/ai-studio', icon: Sparkles },
  ].filter(Boolean).slice(0, 3);

  const submitSearch = value => setSearch(String(value ?? query).trim());
  const chooseCollection = (kind, term = '') => {
    setFilter(kind);
    setQuery(term);
    setSearch(term);
  };

  const favorite = async id => {
    await apiFetch(`/media/${id}/favorite`, { method: 'POST' });
    await load();
  };

  const trash = async id => {
    await apiFetch(`/media/${id}/trash`, { method: 'POST' });
    setViewer(null);
    await load();
    toast.success('Moved to trash.');
  };

  const download = async item => {
    const response = await fetch(mediaSrc(item.id));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.name || 'memory';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggle = id => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const bulk = async action => {
    if (!selected.size) return;
    await apiFetch('/media/bulk', { method: 'POST', body: JSON.stringify({ ids: [...selected], action }) });
    setSelected(new Set());
    await load();
    toast.success('Gallery updated.');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-32 md:pb-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#351329] via-[#160a22] to-[#07161d] p-5 md:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-pink-200/80">Your digital life</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Gallery</h1>
              <p className="mt-3 max-w-xl text-lg leading-7 text-white/62">Find people, events, trips and moments without digging through folders.</p>
            </div>
            <Link href="/upload" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600" aria-label="Upload memories"><Upload className="h-6 w-6" /></Link>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat value={items.length} label="Memories" />
            <Stat value={stats.videos} label="Videos" />
            <Stat value={stats.favorites} label="Favorites" />
          </div>

          <div className="relative mt-6">
            <Search className="absolute left-4 top-4 h-6 w-6 text-pink-200" />
            <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitSearch()} placeholder="Search Priyansh birthday, Niagara, Diwali..." className="h-16 w-full rounded-2xl border border-white/10 bg-black/30 pl-13 pr-28 text-lg outline-none placeholder:text-white/35 focus:border-pink-300/50" />
            <button onClick={() => submitSearch()} className="absolute right-2 top-2 h-12 rounded-xl bg-white px-5 text-base font-black text-black">Search</button>
          </div>
        </div>
      </section>

      {heroEvent && (
        <section className="rounded-[2rem] border border-amber-300/20 bg-gradient-to-br from-amber-400/15 via-pink-500/10 to-purple-600/10 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-pink-500"><Gift className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-200">Today’s priority</p>
              <h2 className="mt-1 text-2xl font-black md:text-3xl">{heroEvent.title}</h2>
              <p className="mt-2 text-base leading-6 text-white/60">{daysLabel(heroEvent.daysUntil)} · SnapNext can prepare a reel, collage, image post, Story and WhatsApp status.</p>
              <div className="mt-4 flex flex-wrap gap-2">{(heroEvent.suggestions || []).slice(0, 5).map(item => <span key={item} className="rounded-full bg-white/8 px-3 py-1.5 text-sm text-white/65">{item.replaceAll('-', ' ')}</span>)}</div>
            </div>
            <Link href="/event-director" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black"><ChevronRight className="h-5 w-5" /></Link>
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="Explore your memories" subtitle="Large smart collections instead of folders" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Collection icon={Users} title="People" detail={`${people.length} recognized`} onClick={() => document.getElementById('people')?.scrollIntoView({ behavior: 'smooth' })} />
          <Collection icon={MapPin} title="Places" detail={`${stats.places} locations`} onClick={() => chooseCollection('all', 'travel')} />
          <Collection icon={CalendarDays} title="Events" detail="Birthdays and trips" onClick={() => chooseCollection('all', 'birthday')} />
          <Collection icon={Heart} title="Favorites" detail={`${stats.favorites} memories`} onClick={() => chooseCollection('favorite')} />
          <Collection icon={Camera} title="Photos" detail={`${stats.photos} saved`} onClick={() => chooseCollection('photo')} />
          <Collection icon={Film} title="Videos" detail={`${stats.videos} saved`} onClick={() => chooseCollection('video')} />
          <Collection icon={FileText} title="Documents" detail={`${stats.documents} found`} onClick={() => chooseCollection('all', 'document')} />
          <Link href="/ai-studio" className="rounded-3xl border border-pink-300/20 bg-gradient-to-br from-pink-500/20 to-purple-600/15 p-5"><WandSparkles className="h-7 w-7 text-pink-200" /><h3 className="mt-6 text-xl font-black">Create with AI</h3><p className="mt-1 text-base leading-6 text-white/52">Reels, collages and stories</p></Link>
        </div>
      </section>

      {continueItems.length > 0 && (
        <section>
          <SectionTitle title="Continue" subtitle="Pick up exactly where you left off" />
          <div className="grid gap-3 md:grid-cols-3">{continueItems.map(({ title, detail, href, icon: Icon }) => <Link key={`${title}-${href}`} href={href} className="flex min-h-28 items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/8"><Icon className="h-5 w-5 text-pink-200" /></div><div><h3 className="text-lg font-black">{title}</h3><p className="mt-1 text-sm leading-5 text-white/48">{detail}</p></div><ChevronRight className="ml-auto h-5 w-5 text-white/35" /></Link>)}</div>
        </section>
      )}

      {people.length > 0 && (
        <section id="people">
          <SectionTitle title="People" subtitle="Your most recognized family and favourite people" />
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">{people.map(person => <button key={person.name} onClick={() => { setQuery(person.name); submitSearch(person.name); }} className="w-28 shrink-0 text-center"><div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-2 border-pink-400/70 bg-white/5">{person.sample ? <img src={mediaSrc(person.sample)} className="h-full w-full origin-top scale-[2.4] object-cover" style={{ objectPosition: '50% 18%' }} alt="" /> : <Users className="m-auto h-full w-8 text-white/30" />}</div><div className="mt-2 truncate text-base font-black">{person.name}</div><div className="text-sm text-white/42">{person.count} memories</div></button>)}</div>
        </section>
      )}

      <section>
        <SectionTitle title="Gallery health" subtitle="One place for cleanup, sync and profile readiness" />
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/health" className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><ShieldCheck className="h-7 w-7 text-cyan-200" /><h3 className="mt-5 text-xl font-black">Clean up safely</h3><p className="mt-2 text-base leading-6 text-white/50">Review duplicates, blurry photos and large videos.</p></Link>
          <Link href="/smart-sync" className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><Cloud className="h-7 w-7 text-sky-200" /><h3 className="mt-5 text-xl font-black">Cloud protection</h3><p className="mt-2 text-base leading-6 text-white/50">Check imports, pending files and sync priority.</p></Link>
          <Link href="/event-director" className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><CircleAlert className="h-7 w-7 text-amber-200" /><h3 className="mt-5 text-xl font-black">Profile readiness</h3><p className="mt-2 text-base leading-6 text-white/50">{profilePrompt ? `${profilePrompt.name} is ${profilePrompt.completeness?.percent || 0}% complete.` : 'Important family profiles are ready.'}</p></Link>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4"><SectionTitle title="Your timeline" subtitle={`${items.length} memories shown`} /><SlidersHorizontal className="mb-4 h-6 w-6 text-white/45" /></div>
        <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">{FILTERS.map(([id, title]) => <button key={id} onClick={() => setFilter(id)} className={`min-h-12 shrink-0 rounded-full px-5 text-base font-black ${filter === id ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'border border-white/10 bg-white/5 text-white/65'}`}>{title}</button>)}</div>

        {selected.size > 0 && <div className="sticky top-3 z-30 mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0414]/95 p-3 shadow-2xl backdrop-blur-xl"><span className="text-base font-black">{selected.size} selected</span><div className="ml-auto flex gap-2"><button onClick={() => bulk('favorite')} className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold">Favorite</button><button onClick={() => bulk('trash')} className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold">Trash</button><button onClick={() => setSelected(new Set())} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5"><X className="h-4 w-4" /></button></div></div>}

        {loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-3xl bg-white/[0.04]" />)}</div> : items.length === 0 ? <Empty /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">{items.map(item => <MemoryCard key={item.id} item={item} selected={selected.has(item.id)} onSelect={() => toggle(item.id)} onOpen={() => setViewer(item)} />)}</div>}
      </section>

      {viewer && <Viewer item={viewer} onClose={() => setViewer(null)} onFavorite={() => favorite(viewer.id)} onDownload={() => download(viewer)} onTrash={() => trash(viewer.id)} />}
    </div>
  );
}

function Stat({ value, label }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-sm text-white/48">{label}</div></div>;
}

function SectionTitle({ title, subtitle }) {
  return <div className="mb-4"><h2 className="text-2xl font-black tracking-tight md:text-3xl">{title}</h2>{subtitle && <p className="mt-1 text-base leading-6 text-white/48">{subtitle}</p>}</div>;
}

function Collection({ icon: Icon, title, detail, onClick }) {
  return <button onClick={onClick} className="min-h-36 rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-left"><Icon className="h-7 w-7 text-pink-200" /><h3 className="mt-6 text-xl font-black">{title}</h3><p className="mt-1 text-base text-white/48">{detail}</p></button>;
}

function MemoryCard({ item, selected, onSelect, onOpen }) {
  return <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"><button onClick={onOpen} className="relative block aspect-[4/5] w-full overflow-hidden bg-white/5 text-left">{item.kind === 'photo' ? <img src={mediaSrc(item.id)} className="h-full w-full object-cover" alt={item.name || 'Memory'} /> : item.kind === 'video' ? <><video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted playsInline /><div className="absolute inset-0 grid place-items-center bg-black/20"><Play className="h-8 w-8 fill-white" /></div></> : <div className="grid h-full place-items-center p-5 text-center text-base text-white/60"><FileText className="mb-3 h-8 w-8" />{item.name}</div>}{(item.favorite || item.isFavorite) && <Star className="absolute right-3 top-3 h-5 w-5 fill-amber-300 text-amber-300" />}</button><div className="flex items-center gap-3 p-3"><button onClick={onSelect} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${selected ? 'border-pink-500 bg-pink-500' : 'border-white/20 bg-white/5'}`}>{selected && <CheckCircle2 className="h-5 w-5" />}</button><div className="min-w-0"><div className="truncate text-base font-black">{item.name || 'Memory'}</div><div className="mt-0.5 text-sm text-white/42">{dateLabel(item.createdAt) || 'Saved memory'}</div></div></div></div>;
}

function Viewer({ item, onClose, onFavorite, onDownload, onTrash }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/92 p-3 backdrop-blur-xl" onClick={onClose}><div className="mx-auto grid min-h-full max-w-5xl place-items-center" onClick={event => event.stopPropagation()}><div className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0711]"><div className="relative grid min-h-[45vh] place-items-center bg-black">{item.kind === 'photo' ? <img src={mediaSrc(item.id)} className="max-h-[72vh] w-full object-contain" alt={item.name || 'Memory'} /> : item.kind === 'video' ? <video src={mediaSrc(item.id)} className="max-h-[72vh] w-full" controls autoPlay /> : <div className="p-8 text-lg">{item.aiAnalysis?.caption || item.aiAnalysis?.description || item.name}</div>}<button onClick={onClose} className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full bg-black/60"><X className="h-5 w-5" /></button></div><div className="p-5"><h2 className="text-2xl font-black">{item.name || 'Memory'}</h2><p className="mt-1 text-base text-white/45">{dateLabel(item.createdAt)}</p>{item.aiAnalysis?.description && <p className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-base leading-7 text-white/65">{item.aiAnalysis.description}</p>}<div className="mt-5 grid grid-cols-3 gap-3"><Action icon={Heart} label="Favorite" onClick={onFavorite} /><Action icon={Download} label="Download" onClick={onDownload} /><Action icon={Trash2} label="Trash" onClick={onTrash} /></div></div></div></div></div>;
}

function Action({ icon: Icon, label, onClick }) {
  return <button onClick={onClick} className="min-h-20 rounded-2xl border border-white/10 bg-white/5 text-base font-bold"><Icon className="mx-auto mb-2 h-5 w-5" />{label}</button>;
}

function Empty() {
  return <Link href="/upload" className="block rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] p-10 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600"><Images className="h-7 w-7" /></div><h3 className="mt-4 text-2xl font-black">Your gallery is ready</h3><p className="mt-2 text-base text-white/50">Upload photos and videos to begin building your digital life.</p></Link>;
}
