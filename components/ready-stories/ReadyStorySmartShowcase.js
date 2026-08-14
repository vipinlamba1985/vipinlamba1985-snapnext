'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { StoryCollage, StoryMotionReel } from '@/components/ready-stories/StoryVisuals';

export default function ReadyStorySmartShowcase({ storyId }) {
  const [story, setStory] = useState(null);

  useEffect(() => {
    let active = true;
    apiFetch(`/ready-story-drafts?id=${encodeURIComponent(storyId)}`)
      .then(data => { if (active) setStory(data?.story || null); })
      .catch(() => { if (active) setStory(null); });
    return () => { active = false; };
  }, [storyId]);

  if (!story || story?.generator !== 'ready-story-v2') return null;
  const collageIds = story.collageMediaIds?.length ? story.collageMediaIds : story.mediaIds || [];

  return <div className="mx-auto max-w-5xl space-y-5 pb-5" data-testid="ready-story-smart-showcase">
    <header>
      <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-pink-200/75"><Sparkles className="h-3.5 w-3.5" />Smart ready story</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">{story.title}</h1>
      <p className="mt-2 text-sm text-white/50">{story.kicker} · {story.sourceCount} related moments · {story.selectedCount || story.mediaIds?.length || 0} best frames selected.</p>
    </header>

    <div className="grid items-start gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section>
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wider text-white/45">Auto story preview</p><span className="text-[11px] text-white/35">Muted by default</span></div>
        <StoryMotionReel story={story} className="mx-auto aspect-[9/14] w-full max-w-[390px] rounded-[2rem] border border-white/10" />
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wider text-white/45">Smart collage</p><span className="text-[11px] text-white/35">{story.collageLayout || 'editorial'} layout · up to 6 photos</span></div>
        <StoryCollage ids={collageIds} layout={story.collageLayout} className="aspect-square w-full rounded-[2rem] border border-white/10" loading="eager" />
        <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/42">SnapNext uses the memory's timing, people, places and existing photo-analysis signals to choose stronger, more varied frames instead of simply taking the first four photos.</div>
      </section>
    </div>
  </div>;
}
