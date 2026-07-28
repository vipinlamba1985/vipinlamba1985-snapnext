'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  ArrowRight, Baby, BookOpen, Calendar, Cat, Film, Heart, Loader2, Plane, Play,
  Sparkles, Users, Wand2, X,
} from 'lucide-react';

function yearsAgo(value) {
  if (!value) return null;
  const year = new Date(value).getFullYear();
  if (!Number.isFinite(year)) return null;
  const diff = new Date().getFullYear() - year;
  return diff > 0 ? diff : null;
}

function dateLabel(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
}

export default function MemoriesPage() {
  const [timelineData, setTimelineData] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [generatingEffect, setGeneratingEffect] = useState(false);
  const [cinematicVideo, setCinematicVideo] = useState(null);
  const [reelData, setReelData] = useState(null);
  const [generatingReel, setGeneratingReel] = useState(false);

  useEffect(() => {
    apiFetch('/memories/timeline')
      .then(setTimelineData)
      .catch(() => toast.error('Your memories could not be opened right now.'));
  }, []);

  const chapters = useMemo(() => {
    if (!timelineData) return [];
    return [
      { id: 'family', title: 'Family', subtitle: 'The people who keep showing up', icon: Users, items: timelineData.familyJourney || [] },
      { id: 'travel', title: 'Trips & places', subtitle: 'Where your memories live', icon: Plane, items: timelineData.travelHistory || [] },
      { id: 'kids', title: 'Growing up', subtitle: 'Little changes worth remembering', icon: Baby, items: timelineData.childGrowth || [] },
      { id: 'love', title: 'Relationships', subtitle: 'Moments you shared together', icon: Heart, items: timelineData.relationship || [] },
      { id: 'pets', title: 'Pets', subtitle: 'The companions in your story', icon: Cat, items: timelineData.petTimeline || [] },
    ].filter(chapter => chapter.items.length > 0);
  }, [timelineData]);

  async function handleImageToVideo(item) {
    if (!item?.id) return;
    setGeneratingEffect(true);
    try {
      const response = await apiFetch('/ai/image-to-video', { method: 'POST', body: JSON.stringify({ mediaId: item.id }) });
      if (response.success) {
        setCinematicVideo(response.motionEffect);
        toast.success('Your cinematic memory is ready.');
      }
    } catch (e) {
      toast.error(e.message || 'This memory could not be animated.');
    } finally {
      setGeneratingEffect(false);
    }
  }

  async function handleCreateReel(chapter) {
    if (!chapter?.items?.length) return;
    setGeneratingReel(true);
    setReelData(null);
    try {
      const response = await apiFetch('/ai/generate-reel', {
        method: 'POST',
        body: JSON.stringify({ theme: chapter.id, mediaIds: chapter.items.slice(0, 8).map(item => item.id) }),
      });
      setReelData(response);
      toast.success('Your reel draft is ready to review.');
    } catch (e) {
      toast.error(e.message || 'SnapNext could not prepare that reel.');
    } finally {
      setGeneratingReel(false);
    }
  }

  if (!timelineData) return <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-white/45"><Loader2 className="h-7 w-7 animate-spin text-pink-300" /><p className="text-sm font-semibold">Bringing your memories together…</p></div>;

  const onThisDay = Array.isArray(timelineData.onThisDay) ? timelineData.onThisDay : [];
  const todayHero = onThisDay[0] || null;
  const recaps = [
    timelineData.monthlyRecap && { id: 'month', label: 'This month', text: timelineData.monthlyRecap },
    timelineData.yearlyRecap && { id: 'year', label: 'Your year', text: timelineData.yearlyRecap },
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-32 md:pb-12">
      <header data-testid="memories-header">
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-300/15 bg-pink-500/10 px-3 py-1.5 text-xs font-black text-pink-100"><Heart className="h-3.5 w-3.5 fill-pink-300" />Memories</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Rediscover the moments that made your life.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48 md:text-base">No dashboard, no sorting work. Just the moments SnapNext can bring back for you.</p>
      </header>

      <section data-testid="memories-today">
        <SectionHeader title="Today" />
        {todayHero ? <button data-testid="memories-today-hero" onClick={() => { setViewer(todayHero); setCinematicVideo(null); }} className="relative block h-72 w-full overflow-hidden rounded-[2rem] border border-white/8 text-left md:h-80"><img src={mediaSrc(todayHero.id)} alt={todayHero.name || 'Memory'} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" /><div className="absolute inset-x-0 bottom-0 p-5 md:p-7"><span className="inline-flex rounded-full bg-purple-500/75 px-3 py-1 text-xs font-black">This day{yearsAgo(todayHero.createdAt) ? ` · ${yearsAgo(todayHero.createdAt)} years ago` : ''}</span><h2 className="mt-3 line-clamp-2 text-2xl font-black md:text-3xl">{todayHero.name || 'A memory worth revisiting'}</h2><p className="mt-1 text-sm text-white/65">{onThisDay.length} moment{onThisDay.length === 1 ? '' : 's'} from this date</p></div></button> : <Link data-testid="memories-today-empty" href="/upload" className="flex min-h-44 items-center justify-center rounded-[2rem] border border-dashed border-white/12 bg-white/[0.025] p-8 text-center"><div><Calendar className="mx-auto h-7 w-7 text-white/30" /><h2 className="mt-3 font-black">Nothing from this exact day yet</h2><p className="mt-1 text-sm text-white/42">As your library grows, little windows back in time will appear here.</p></div></Link>}
      </section>

      {onThisDay.length > 1 && <section data-testid="memories-past-years"><SectionHeader title="This day, in past years" subtitle="Little windows back in time" /><div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">{onThisDay.map(item => <button data-testid={`memories-past-${item.id}`} key={item.id} onClick={() => { setViewer(item); setCinematicVideo(null); }} className="relative h-52 w-40 shrink-0 overflow-hidden rounded-3xl border border-white/8 text-left"><img src={mediaSrc(item.id)} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" /><div className="absolute inset-x-0 bottom-0 p-3"><p className="text-xs font-black text-white/70">{yearsAgo(item.createdAt) ? `${yearsAgo(item.createdAt)} years ago` : dateLabel(item.createdAt)}</p><p className="mt-1 truncate text-sm font-black">{item.name || 'Memory'}</p></div></button>)}</div></section>}

      {recaps.length > 0 && <section data-testid="memories-recaps"><SectionHeader title="Stories SnapNext noticed" subtitle="Quiet summaries from memories you already own" /><div className="grid gap-3 md:grid-cols-2">{recaps.map(recap => <div key={recap.id} className="rounded-3xl border border-white/8 bg-gradient-to-br from-purple-500/[0.08] to-pink-500/[0.04] p-5"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-black text-purple-100"><Sparkles className="h-3.5 w-3.5" />{recap.label}</span><p className="mt-4 text-sm leading-6 text-white/68">{recap.text}</p></div>)}</div></section>}

      {chapters.length > 0 && <section data-testid="memories-chapters"><SectionHeader title="Your chapters" subtitle="Real collections from your own library" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{chapters.map(chapter => { const Icon = chapter.icon; const cover = chapter.items[0]; return <button data-testid={`memories-chapter-${chapter.id}`} key={chapter.id} onClick={() => { setSelectedChapter(chapter); setReelData(null); }} className="relative min-h-48 overflow-hidden rounded-[1.7rem] border border-white/8 bg-white/[0.03] text-left">{cover && <img src={mediaSrc(cover.id)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />}<div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" /><div className="relative flex min-h-48 flex-col justify-between p-5"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-black/35 backdrop-blur"><Icon className="h-5 w-5 text-pink-100" /></div><div><h3 className="text-xl font-black">{chapter.title}</h3><p className="mt-1 text-sm text-white/58">{chapter.subtitle}</p><p className="mt-2 text-xs font-bold text-white/40">{chapter.items.length} memories</p></div></div></button>; })}</div></section>}

      {selectedChapter && <section data-testid="memories-selected-chapter" className="rounded-[2rem] border border-white/8 bg-white/[0.025] p-4 md:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-pink-200/70">Your chapter</p><h2 className="mt-1 text-2xl font-black">{selectedChapter.title}</h2><p className="mt-1 text-sm text-white/45">{selectedChapter.subtitle}</p></div><button data-testid="memories-close-chapter" onClick={() => { setSelectedChapter(null); setReelData(null); }} className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><X className="h-4 w-4" /></button></div><div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">{selectedChapter.items.slice(0, 18).map(item => <button key={item.id} onClick={() => { setViewer(item); setCinematicVideo(null); }} className="aspect-square overflow-hidden rounded-xl bg-white/5"><img src={mediaSrc(item.id)} alt="" className="h-full w-full object-cover" /></button>)}</div><div className="mt-5 flex flex-wrap gap-2"><button data-testid="memories-create-reel" onClick={() => handleCreateReel(selectedChapter)} disabled={generatingReel} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 text-sm font-black disabled:opacity-50">{generatingReel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}Make a reel</button><Link href="/ai-studio" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/8 bg-white/5 px-5 text-sm font-black text-white/70"><Wand2 className="h-4 w-4" />Create something else</Link></div>{reelData && <ReelPreview data={reelData} cover={selectedChapter.items[0]} />}</section>}

      {!chapters.length && !onThisDay.length && !recaps.length && <section data-testid="memories-empty" className="rounded-[2rem] border border-dashed border-white/12 bg-white/[0.025] p-10 text-center"><BookOpen className="mx-auto h-8 w-8 text-white/30" /><h2 className="mt-4 text-xl font-black">Your story starts with a few moments</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">Back up photos and videos and SnapNext will begin bringing meaningful chapters back to you.</p><Link href="/upload" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-black text-black">Add memories</Link></section>}

      {viewer && <div data-testid="memories-viewer" className="fixed inset-0 z-50 overflow-y-auto bg-black/92 p-4 backdrop-blur-xl" onClick={() => { setViewer(null); setCinematicVideo(null); }}><div className="mx-auto max-w-2xl pt-6" onClick={event => event.stopPropagation()}><div className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0b0711]"><div className="relative bg-black"><img src={mediaSrc(viewer.id)} alt={viewer.name || 'Memory'} className="max-h-[68vh] w-full object-contain" /><button data-testid="memories-viewer-close" onClick={() => { setViewer(null); setCinematicVideo(null); }} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/65"><X className="h-4 w-4" /></button></div><div className="p-5"><h2 className="text-xl font-black">{viewer.name || 'Memory'}</h2><p className="mt-1 text-sm text-white/42">{dateLabel(viewer.createdAt)}</p>{cinematicVideo ? <div className="mt-5 rounded-2xl border border-pink-300/15 bg-pink-500/[0.06] p-4"><div className="flex items-center gap-2 text-sm font-black text-pink-100"><Sparkles className="h-4 w-4" />Cinematic memory ready</div><p className="mt-2 text-xs leading-5 text-white/50">{cinematicVideo.zoom ? `${cinematicVideo.zoom} · ` : ''}{cinematicVideo.framerate ? `${cinematicVideo.framerate} · ` : ''}{cinematicVideo.vibe || 'Motion effect prepared'}</p></div> : <button data-testid="memories-cinematic-action" onClick={() => handleImageToVideo(viewer)} disabled={generatingEffect} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/8 bg-white/5 px-5 text-sm font-black disabled:opacity-50">{generatingEffect ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Bring this memory to life</button>}</div></div></div></div>}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return <div className="mb-4"><h2 className="text-xl font-black md:text-2xl">{title}</h2>{subtitle && <p className="mt-1 text-sm text-white/42">{subtitle}</p>}</div>;
}

function ReelPreview({ data, cover }) {
  return <div data-testid="memories-reel-preview" className="mt-5 rounded-3xl border border-pink-300/15 bg-pink-500/[0.06] p-4"><div className="flex items-center gap-2 text-sm font-black"><Play className="h-4 w-4 fill-white" />Reel draft</div><div className="mt-3 flex gap-4">{cover && <img src={mediaSrc(cover.id)} alt="" className="h-24 w-20 shrink-0 rounded-2xl object-cover" />}<div className="min-w-0"><h3 className="font-black">{data.title || 'Your memory reel'}</h3>{data.caption && <p className="mt-1 line-clamp-3 text-sm leading-5 text-white/50">{data.caption}</p>}<Link href="/ai-video" className="mt-3 inline-flex items-center gap-1 text-xs font-black text-pink-200">Open video tools<ArrowRight className="h-3.5 w-3.5" /></Link></div></div></div>;
}
