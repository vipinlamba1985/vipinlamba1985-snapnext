'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { StoryCollage } from '@/components/ready-stories/StoryVisuals';
import StoryReelAudio from '@/components/ready-stories/StoryReelAudio';

function StoryBadge({ story }) {
  const labels = {
    trip: 'Trip',
    wedding: 'Wedding',
    'birthday-memory': 'Birthday',
    birthday: 'Birthday',
    anniversary: 'Anniversary',
    celebration: 'Celebration',
    memory: 'Memory',
    'on-this-day': 'On this day',
    'saved-story': 'Saved story',
    'confirmed-event': 'Memory story',
  };
  const label = labels[story?.type] || 'Memory story';
  return <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/90 backdrop-blur"><Sparkles className="h-3 w-3" />{label}</div>;
}

function currentStories(data) {
  return (Array.isArray(data?.items) ? data.items : []).filter(item => item?.generator === 'ready-story-v2');
}

async function refreshCurrentStories() {
  let data = await apiFetch('/ready-story-drafts', { method: 'POST', body: JSON.stringify({ action: 'refresh' }) });
  let current = currentStories(data);
  const legacy = (Array.isArray(data?.items) ? data.items : []).filter(item => item?.id && item?.generator && item.generator !== 'ready-story-v2');
  if (current.length < 3 && legacy.length) {
    await Promise.allSettled(legacy.map(item => apiFetch('/ready-story-drafts', { method: 'POST', body: JSON.stringify({ action: 'dismiss', id: item.id }) })));
    data = await apiFetch('/ready-story-drafts', { method: 'POST', body: JSON.stringify({ action: 'refresh' }) });
    current = currentStories(data);
  }
  return current;
}

export default function HomeReadyStories() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    refreshCurrentStories()
      .then(items => { if (active) setStories(items); })
      .catch(() => { if (active) setStories([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function dismiss(id) {
    const previous = stories;
    setStories(items => items.filter(item => item.id !== id));
    try { await apiFetch('/ready-story-drafts', { method: 'POST', body: JSON.stringify({ action: 'dismiss', id }) }); }
    catch { setStories(previous); }
  }

  if (loading) return <section data-testid="home-ready-stories-loading"><div className="h-72 animate-pulse rounded-[2rem] bg-white/[0.04]" /></section>;
  if (!stories.length) return null;
  const [featured, ...rest] = stories;

  return <section data-testid="home-ready-stories" className="space-y-3">
    <div>
      <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-pink-200/75"><Sparkles className="h-3.5 w-3.5" />Ready for you</div>
      <h2 className="mt-1 text-[24px] font-black tracking-tight">SnapNext made these from your memories</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">Auto-playing memory stories and richer collages, smart-selected from people, dates, places and existing photo intelligence. A free CC0 soundtrack is ready when you tap sound. Private until you choose to share.</p>
    </div>

    <article data-testid={`home-ready-story-${featured.id}`} className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035]">
      <div className="relative h-[310px] sm:h-[340px]">
        <StoryReelAudio story={featured} className="h-full w-full" />
        <div className="absolute right-14 top-7"><StoryBadge story={featured} /></div>
        <button onClick={() => dismiss(featured.id)} aria-label="Dismiss this story" className="absolute right-4 top-[4.6rem] grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/45 backdrop-blur"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
        <p className="text-[11px] font-semibold leading-4 text-white/45">Smart-selected from {featured.sourceCount} related moments · {featured.selectedCount || featured.mediaIds?.length || 0} best frames · private draft</p>
        <Link data-testid="home-ready-story-review" href={`/ready-story/${encodeURIComponent(featured.id)}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-black text-black">Review & share<ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </article>

    {rest.length > 0 && <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">{rest.map(story => <article key={story.id} className="w-[230px] shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      <div className="relative h-40">
        <StoryCollage ids={story.collageMediaIds || story.mediaIds} layout={story.collageLayout} className="h-full w-full" />
        <div className="absolute left-3 top-3"><StoryBadge story={story} /></div>
        <button onClick={() => dismiss(story.id)} aria-label="Dismiss this story" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/45"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-4"><p className="text-[11px] font-black text-pink-100/70">{story.kicker}</p><h3 className="mt-1 line-clamp-2 font-black">{story.title}</h3><p className="mt-1 text-[11px] text-white/40">{story.sourceCount} related moments · smart selection</p><Link href={`/ready-story/${encodeURIComponent(story.id)}`} className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-full border border-white/12 px-3 text-xs font-bold text-white/75">Review<ArrowRight className="h-3 w-3" /></Link></div>
    </article>)}</div>}
  </section>;
}
