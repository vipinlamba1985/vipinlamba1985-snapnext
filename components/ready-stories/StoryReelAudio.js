'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { soundtrackForStory } from '@/lib/ready-story-audio';
import { StoryMotionReel } from '@/components/ready-stories/StoryVisuals';

export default function StoryReelAudio({ story, className = '', compact = false, showTitle = true }) {
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const soundtrack = useMemo(() => soundtrackForStory(story), [story]);
  const [soundOn, setSoundOn] = useState(false);
  const [inView, setInView] = useState(true);
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    if (!rootRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting !== false), { threshold: 0.2 });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !soundOn) return;
    if (!inView) {
      audio.pause();
      return;
    }
    audio.play().catch(() => {
      setSoundOn(false);
      setAudioError(true);
    });
  }, [inView, soundOn]);

  async function toggleSound() {
    const audio = audioRef.current;
    if (!audio) return;
    if (soundOn) {
      audio.pause();
      setSoundOn(false);
      return;
    }
    setAudioError(false);
    audio.muted = false;
    audio.volume = 0.28;
    try {
      if (audio.readyState === 0) audio.load();
      await audio.play();
      setSoundOn(true);
    } catch {
      setSoundOn(false);
      setAudioError(true);
    }
  }

  return <div ref={rootRef} className={`relative ${className}`} data-testid="story-reel-audio">
    <StoryMotionReel story={story} compact={compact} showTitle={showTitle} showMutedBadge={false} className="h-full w-full" />
    {soundtrack && <>
      <audio ref={audioRef} loop preload="none" playsInline onError={() => { setSoundOn(false); setAudioError(true); }} aria-hidden="true">
        {soundtrack.mp3Url && <source src={soundtrack.mp3Url} type="audio/mpeg" />}
        {soundtrack.audioUrl && <source src={soundtrack.audioUrl} type="audio/ogg" />}
      </audio>
      <button type="button" onClick={toggleSound} aria-label={soundOn ? 'Mute free story soundtrack' : 'Play free story soundtrack'} title={`${soundtrack.title} · ${soundtrack.license}`} className="absolute left-3 top-7 z-30 inline-flex min-h-9 items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 text-[11px] font-black text-white backdrop-blur">
        {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        <span>{soundOn ? 'Sound on' : audioError ? 'Retry sound' : 'Tap for sound'}</span>
      </button>
      {!compact && <div className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex max-w-[72%] items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white/70 backdrop-blur"><Music2 className="h-3 w-3 shrink-0" /><span className="truncate">{soundtrack.title} · {soundtrack.license}</span></div>}
    </>}
  </div>;
}
