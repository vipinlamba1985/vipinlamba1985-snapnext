'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Search, Heart, Trash2, Download, Star, CheckCircle2, Image as ImageIcon,
  Film, Pencil, FileText, Camera, MapPin, Users, CalendarDays, Sparkles,
  ChevronRight, X, MoreHorizontal, Cloud, Play,
} from 'lucide-react';

const NAME_KEY = 'snapnext.personNames.v1';
const FILTERS = [
  ['all', 'All'], ['photo', 'Photos'], ['video', 'Videos'], ['favorite', 'Favorites'],
];

function cleanName(value) {
  const name = String(value || '').trim();
  return !name || /^person\s*\d+$/i.test(name) || ['person', 'people', 'unknown', 'face', 'user'].includes(name.toLowerCase()) ? 'Add name' : name;
}

function dateLabel(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
}

function normalizePayload(value) {
  return value && typeof value === 'object' ? value : {};
}

export default function GalleryPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [names, setNames] = useState({});
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { setNames(JSON.parse(localStorage.getItem(NAME_KEY) || '{}')); } catch {}
  }, []);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ filter });
    if (search) params.set('q', search);
    try {
      const data = normalizePayload(await apiFetch(`/media?${params}`));
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      toast.error(error.message || 'Gallery could not load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter, search]);

  const label = raw => names[raw] || cleanName(raw);
  const saveName = raw => {
    const value = window.prompt('Name this person', label(raw) === 'Add name' ? '' : label(raw));
    if (!value?.trim()) return;
    const next = { ...names, [raw]: value.trim() };
    setNames(next);
    try { localStorage.setItem(NAME_KEY, JSON.stringify(next)); } catch {}
  };

  const people = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      for (const face of item.aiAnalysis?.faces || []) {
        const key = String(face || '').trim();
        if (!key) continue;
        const entry = map.get(key) || { name: key, count: 0, sample: null, favorite: false };
        entry.count += 1;
        entry.favorite ||= Boolean(item.favorite);
        if (!entry.sample && item.kind === 'photo') entry.sample = item.id;
        map.set(key, entry);
      }
    }
    return [...map.values()].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.count - a.count).slice(0, 12);
  }, [items]);

  const suggestions = useMemo(() => {
    const values = new Set(['family', 'birthday', 'celebration', 'travel', 'screenshots', 'documents']);
    people.forEach(person => values.add(label(person.name)));
    items.forEach(item => {
      (item.aiAnalysis?.tags || []).forEach(tag => values.add(String(tag)));
      if (item.aiAnalysis?.autoAlbum) values.add(item.aiAnalysis.autoAlbum);
    });
    const text = query.trim().toLowerCase();
    return text ? [...values].filter(value => value.toLowerCase().includes(text)).slice(0, 6) : [];
  }, [query, people, items, names]);

  const recentPhotos = items.filter(item => item.kind === 'photo').length;
  const videos = items.filter(item => item.kind === 'video').length;
  const favorites = items.filter(item => item.favorite).length;
  const places = new Set(items.flatMap(item => item.aiAnalysis?.locations || [])).size;

  const go = value => setSearch(String(value ?? query).trim());
  const chooseCollection = value => {
    if (value === 'photos') { setFilter('photo'); setQuery(''); setSearch(''); }
    if (value === 'videos') { setFilter('video'); setQuery(''); setSearch(''); }
    if (value === 'favorites') { setFilter('favorite'); setQuery(''); setSearch(''); }
    if (value === 'documents') { setFilter('all'); setQuery('document'); setSearch('document'); }
    if (value === 'places') { setFilter('all'); setQuery('travel'); setSearch('travel'); }
  };

  const favorite = async id => { await apiFetch(`/media/${id}/favorite`, { method: 'POST' }); await load(); };
  const trash = async id => { await apiFetch(`/media/${id}/trash`, { method: 'POST' }); setViewer(null); await load(); toast.success('Moved to trash.'); };
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
    <div className="mx-auto max-w-6xl space-y-7 pb-32 md:pb-12">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#261023] via-[#13081f] to-[#07151c] p-5 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-pink-200/75">Your memories</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-6xl">Gallery</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-white/58">Explore the people, places and moments that make up your digital life.</p>
          </div>
          <Link href="/upload" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600" aria-label="Upload memories"><Camera className="h-5 w-5" /></Link>
        </div>

        <div className="relative mt-6">
          <Search className="absolute left-4 top-4 h-5 w-5 text-pink-200" />
          <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && go()} placeholder="Search people, trips, birthdays or places" className="h-14 w-full rounded-2xl border border-white/10 bg-black/25 pl-12 pr-24 text-base text-white outline-none placeholder:text-white/35 focus:border-pink-300/40" />
          <button onClick={() => go()} className="absolute right-2 top-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">Search</button>
          {suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-white/10 bg-[#13091d] p-2 shadow-2xl">{suggestions.map(value => <button key={value} onClick={() => { setQuery(value); go(value); }} className="block w-full rounded-xl px-4 py-3 text-left text-base hover:bg-white/5">{value}</button>)}</div>}
        </div>
      </section>

      <section>
        <SectionTitle title="Explore" subtitle="Smart collections built from your real memories" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CollectionCard icon={Users} title="People" detail={`${people.length} recognized`} onClick={() => document.getElementById('people-section')?.scrollIntoView({ behavior: 'smooth' })} />
          <CollectionCard icon={MapPin} title="Places" detail={`${places} locations`} onClick={() => chooseCollection('places')} />
          <CollectionCard icon={Film} title="Videos" detail={`${videos} saved`} onClick={() => chooseCollection('videos')} />
          <CollectionCard icon={Heart} title="Favorites" detail={`${favorites} memories`} onClick={() => chooseCollection('favorites')} />
          <CollectionCard icon={Camera} title="Photos" detail={`${recentPhotos} saved`} onClick={() => chooseCollection('photos')} />
          <CollectionCard icon={FileText} title="Documents" detail="Receipts and scans" onClick={() => chooseCollection('documents')} />
          <CollectionCard icon={CalendarDays} title="Events" detail="Birthdays and trips" onClick={() => { setQuery('birthday'); go('birthday'); }} />
          <Link href="/ai-studio" className="rounded-3xl border border-pink-300/20 bg-gradient-to-br from-pink-500/15 to-purple-600/15 p-4"><Sparkles className="h-6 w-6 text-pink-200" /><h3 className="mt-5 text-xl font-black">Create with AI</h3><p className="mt-1 text-sm leading-5 text-white/50">Stories, reels and collages</p></Link>
        </div>
      </section>

      {people.length > 0 && <section id="people-section"><SectionTitle title="People" subtitle="Tap a person to view their memories. Tap the name to edit it." /><div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">{people.map(person => <div key={person.name} className="w-24 shrink-0 text-center"><button onClick={() => { setQuery(label(person.name)); go(person.name); }} className="mx-auto h-20 w-20 overflow-hidden rounded-full border-2 border-pink-400/70 bg-white/5">{person.sample ? <img src={mediaSrc(person.sample)} className="h-full w-full origin-top scale-[2.5] object-cover" style={{ objectPosition: '50% 18%' }} alt="" /> : <Users className="m-auto h-full w-7 text-white/30" />}</button><button onClick={() => saveName(person.name)} className="mt-2 inline-flex max-w-full items-center gap-1 text-sm font-bold"><span className="truncate">{label(person.name)}</span><Pencil className="h-3.5 w-3.5 text-white/35" /></button><p className="text-xs text-white/38">{person.count} memories</p></div>)}</div></section>}

      <section>
        <div className="flex items-end justify-between gap-4">
          <SectionTitle title="All memories" subtitle={`${items.length} items shown`} />
          <button className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5"><MoreHorizontal className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">{FILTERS.map(([id, title]) => <button key={id} onClick={() => setFilter(id)} className={`min-h-11 shrink-0 rounded-full px-5 text-base font-bold ${filter === id ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'border border-white/10 bg-white/5 text-white/65'}`}>{title}</button>)}</div>

        {selected.size > 0 && <div className="sticky top-3 z-30 mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0414]/95 p-3 shadow-2xl backdrop-blur-xl"><span className="text-base font-black">{selected.size} selected</span><div className="ml-auto flex gap-2"><button onClick={() => bulk('favorite')} className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold">Favorite</button><button onClick={() => bulk('trash')} className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold">Trash</button><button onClick={() => setSelected(new Set())} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5"><X className="h-4 w-4" /></button></div></div>}

        {loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-3xl bg-white/[0.04]" />)}</div> : items.length === 0 ? <Empty /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">{items.map(item => <MemoryCard key={item.id} item={item} selected={selected.has(item.id)} onSelect={() => toggle(item.id)} onOpen={() => setViewer(item)} />)}</div>}
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600"><Cloud className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 className="text-xl font-black">Gallery health</h2><p className="mt-1 text-sm leading-5 text-white/50">Review duplicates, blurry photos and cloud sync from one place.</p></div><Link href="/health" className="grid h-11 w-11 place-items-center rounded-full bg-white/5"><ChevronRight className="h-5 w-5" /></Link></div>
      </section>

      {viewer && <Viewer item={viewer} onClose={() => setViewer(null)} onFavorite={() => favorite(viewer.id)} onDownload={() => download(viewer)} onTrash={() => trash(viewer.id)} />}
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return <div className="mb-3"><h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>{subtitle && <p className="mt-1 text-base leading-6 text-white/45">{subtitle}</p>}</div>;
}

function CollectionCard({ icon: Icon, title, detail, onClick }) {
  return <button onClick={onClick} className="min-h-36 rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-left active:scale-[0.99]"><Icon className="h-6 w-6 text-pink-200" /><h3 className="mt-5 text-xl font-black">{title}</h3><p className="mt-1 text-sm text-white/45">{detail}</p></button>;
}

function MemoryCard({ item, selected, onSelect, onOpen }) {
  return <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"><button onClick={onOpen} className="relative block aspect-[4/5] w-full overflow-hidden bg-white/5 text-left">{item.kind === 'photo' ? <img src={mediaSrc(item.id)} className="h-full w-full object-cover" alt={item.name || 'Memory'} /> : item.kind === 'video' ? <><video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted /><div className="absolute inset-0 grid place-items-center bg-black/20"><Play className="h-8 w-8 fill-white" /></div></> : <div className="p-4 text-sm leading-6 text-white/65">{item.aiAnalysis?.caption || item.aiAnalysis?.description || item.name}</div>}<button onClick={event => { event.stopPropagation(); onSelect(); }} className={`absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full border ${selected ? 'border-pink-500 bg-pink-500' : 'border-white/35 bg-black/45'}`}>{selected && <CheckCircle2 className="h-5 w-5" />}</button>{item.favorite && <Star className="absolute right-3 top-3 h-5 w-5 fill-amber-300 text-amber-300" />}</button><button onClick={onOpen} className="w-full p-3 text-left"><h3 className="truncate text-base font-black">{item.name || 'Memory'}</h3><p className="mt-1 truncate text-sm text-white/42">{dateLabel(item.createdAt) || item.kind}</p></button></article>;
}

function Viewer({ item, onClose, onFavorite, onDownload, onTrash }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-3 backdrop-blur-xl" onClick={onClose}><div className="mx-auto max-w-5xl pt-3 md:pt-8" onClick={event => event.stopPropagation()}><div className="mb-3 flex justify-end"><button onClick={onClose} className="grid h-12 w-12 place-items-center rounded-full bg-white/10"><X className="h-5 w-5" /></button></div><div className="grid gap-4 md:grid-cols-[1fr_340px]"><div className="grid min-h-[55vh] place-items-center overflow-hidden rounded-[2rem] bg-black">{item.kind === 'photo' ? <img src={mediaSrc(item.id)} className="max-h-[78vh] w-full object-contain" alt="" /> : item.kind === 'video' ? <video src={mediaSrc(item.id)} className="max-h-[78vh] w-full" controls autoPlay /> : <div className="p-8 text-lg leading-8">{item.aiAnalysis?.caption || item.aiAnalysis?.description}</div>}</div><aside className="rounded-[2rem] border border-white/10 bg-[#0b0711] p-5"><h2 className="text-2xl font-black">{item.name || 'Memory'}</h2><p className="mt-2 text-base text-white/45">{dateLabel(item.createdAt)}</p>{item.aiAnalysis?.description && <p className="mt-5 rounded-2xl bg-white/[0.04] p-4 text-base leading-7 text-white/65">{item.aiAnalysis.description}</p>}<div className="mt-5 grid grid-cols-3 gap-2"><Action icon={Heart} label="Favorite" onClick={onFavorite} /><Action icon={Download} label="Download" onClick={onDownload} /><Action icon={Trash2} label="Trash" onClick={onTrash} /></div></aside></div></div></div>;
}

function Action({ icon: Icon, label, onClick }) {
  return <button onClick={onClick} className="min-h-20 rounded-2xl border border-white/10 bg-white/5 px-2 text-sm font-bold"><Icon className="mx-auto mb-2 h-5 w-5" />{label}</button>;
}

function Empty() {
  return <Link href="/upload" className="block rounded-[2rem] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600"><ImageIcon className="h-6 w-6" /></div><h3 className="mt-4 text-2xl font-black">Your gallery is ready</h3><p className="mt-2 text-base leading-6 text-white/50">Upload photos and videos to begin building your digital life.</p></Link>;
}
