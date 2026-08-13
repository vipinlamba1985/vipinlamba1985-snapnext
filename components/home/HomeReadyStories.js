'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Images, Sparkles, X } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';

function StoryCollage({ story, compact = false }) {
  const ids = Array.isArray(story?.collageMediaIds) ? story.collageMediaIds.slice(0, 4) : [];
  if (!ids.length) return <div className="grid h-full place-items-center bg-white/[0.04]"><Images className="h-8 w-8 text-white/25" /></div>;
  return <div className={`grid h-full w-full ${ids.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-0.5 bg-black`}>{ids.map((id, index) => <div key={id} className={`overflow-hidden ${ids.length === 3 && index === 2 ? 'col-span-2' : ''}`}><img src={mediaSrc(id)} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${compact ? 'min-h-[84px]' : 'min-h-[126px]'}`} /></div>)}</div>;
}

function StoryBadge({ story }) {
  const label = story?.type === 'trip' ? 'Trip' : story?.type === 'birthday' ? 'Birthday' : story?.type === 'anniversary' ? 'Anniversary' : story?.type === 'on-this-day' ? 'On this day' : story?.type === 'saved-story' ? 'Saved story' : 'Memory story';
  return <div className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/85 backdrop-blur"><Sparkles className="h-3 w-3" />{label}</div>;
}

export default function HomeReadyStories() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch('/ready-story-drafts', { method: 'POST', body: JSON.stringify({ action: 'refresh' }) })
      .then(data => { if (active) setStories(Array.isArray(data?.items) ? data.items : []); })
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

  if (loading) return <section data-testid="home-ready-stories-loading"><div className="h-80 animate-pulse rounded-[2rem] bg-white/[0.04]" /></section>;
  if (!stories.length) return null;
  const [featured, ...rest] = stories;

  return <section data-testid="home-ready-stories" className="space-y-3">
    <div><div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-pink-200/75"><Sparkles className="h-3.5 w-3.5" />Ready for you</div><h2 className="mt-1 text-[24px] font-black tracking-tight">Stories already made from your memories</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">Private drafts from trips, celebrations and meaningful dates. Nothing is sent anywhere until you approve it.</p></div>
    <article data-testid={`home-ready-story-${featured.id}`} className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035]">
      <div className="relative h-64 md:h-72"><StoryCollage story={featured} /><div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" /><div className="absolute left-4 top-4"><StoryBadge story={featured} /></div><button onClick={() => dismiss(featured.id)} aria-label="Dismiss this story" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/45"><X className="h-4 w-4" /></button><div className="absolute inset-x-0 bottom-0 p-5"><p className="text-xs font-black text-pink-100/80">{featured.kicker}</p><h3 className="mt-1 text-2xl font-black leading-tight">{featured.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-5 text-white/65">{featured.caption}</p></div></div>
      <div className="flex items-center justify-between gap-3 px-5 py-4"><p className="text-xs font-semibold text-white/42">{featured.sourceCount} saved moments · private draft · no new AI generation</p><Link data-testid="home-ready-story-review" href={`/ready-to-post?story=${encodeURIComponent(featured.id)}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-black text-black">Review<ArrowRight className="h-3.5 w-3.5" /></Link></div>
    </article>
    {rest.length > 0 && <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">{rest.map(story => <article key={story.id} className="w-[230px] shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"><div className="relative h-40"><StoryCollage story={story} compact /><div className="absolute left-3 top-3"><StoryBadge story={story} /></div><button onClick={() => dismiss(story.id)} aria-label="Dismiss this story" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/45"><X className="h-3.5 w-3.5" /></button></div><div className="p-4"><p className="text-[11px] font-black text-pink-100/70">{story.kicker}</p><h3 className="mt-1 line-clamp-2 font-black">{story.title}</h3><p className="mt-1 text-[11px] text-white/40">{story.sourceCount} moments</p><Link href={`/ready-to-post?story=${encodeURIComponent(story.id)}`} className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-full border border-white/12 px-3 text-xs font-bold text-white/75">Review<ArrowRight className="h-3 w-3" /></Link></div></article>)}</div>}
  </section>;
}
