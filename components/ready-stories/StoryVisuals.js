'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { mediaSrc } from '@/lib/api-client';

function editorialCells(count) {
  if (count <= 1) return [[0, 0, 100, 100]];
  if (count === 2) return [[0, 0, 58, 100], [58, 0, 42, 100]];
  if (count === 3) return [[0, 0, 58, 100], [58, 0, 42, 50], [58, 50, 42, 50]];
  if (count === 4) return [[0, 0, 58, 100], [58, 0, 42, 50], [58, 50, 21, 50], [79, 50, 21, 50]];
  if (count === 5) return [[0, 0, 60, 62], [60, 0, 40, 62], [0, 62, 33, 38], [33, 62, 34, 38], [67, 62, 33, 38]];
  return [[0, 0, 56, 62], [56, 0, 44, 62], [0, 62, 25, 38], [25, 62, 25, 38], [50, 62, 25, 38], [75, 62, 25, 38]];
}

function cinemaCells(count) {
  if (count <= 1) return [[0, 0, 100, 100]];
  if (count === 2) return [[0, 0, 100, 62], [0, 62, 100, 38]];
  const bottomCount = count - 1;
  const width = 100 / bottomCount;
  return [[0, 0, 100, 64], ...Array.from({ length: bottomCount }, (_, index) => [index * width, 64, width, 36])];
}

export function collageCells(count, layout = 'editorial') {
  const safeCount = Math.max(1, Math.min(6, Number(count) || 1));
  const cells = layout === 'cinema' ? cinemaCells(safeCount) : editorialCells(safeCount);
  if (layout !== 'magazine') return cells;
  return cells.map(([x, y, width, height]) => [100 - x - width, y, width, height]);
}

export function StoryCollage({ ids = [], layout = 'editorial', className = '', loading = 'lazy' }) {
  const visible = Array.isArray(ids) ? ids.slice(0, 6) : [];
  if (!visible.length) return <div className={`relative grid place-items-center overflow-hidden bg-white/[0.04] ${className}`}><span className="text-xs font-bold text-white/30">No collage photos</span></div>;
  const cells = collageCells(visible.length, layout);
  return <div className={`relative overflow-hidden bg-black ${className}`}>{visible.map((id, index) => {
    const [x, y, width, height] = cells[index];
    return <div key={id} className="absolute overflow-hidden border border-black/70" style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }}><img src={mediaSrc(id)} alt="" loading={loading} decoding="async" className="h-full w-full object-cover" /></div>;
  })}</div>;
}

export function StoryMotionReel({ story, className = '', compact = false, showTitle = true, showMutedBadge = true }) {
  const videoMediaId = story?.videoMediaId ? String(story.videoMediaId) : '';
  const frames = useMemo(() => {
    if (Array.isArray(story?.reelFrames) && story.reelFrames.length) return story.reelFrames.filter(frame => frame?.mediaId).slice(0, 8);
    const ids = Array.isArray(story?.reelMediaIds) ? story.reelMediaIds : story?.mediaIds || [];
    return ids.slice(0, 8).map(mediaId => ({ mediaId, caption: '' }));
  }, [story]);
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(Boolean(media?.matches));
    sync();
    media?.addEventListener?.('change', sync);
    return () => media?.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!rootRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting !== false), { threshold: 0.2 });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (videoMediaId || !playing || !inView || frames.length <= 1) return undefined;
    const timer = window.setInterval(() => setActive(index => (index + 1) % frames.length), compact ? 3000 : 3600);
    return () => window.clearInterval(timer);
  }, [compact, frames.length, inView, playing, videoMediaId]);

  useEffect(() => {
    if (videoMediaId || !frames.length) return;
    const next = frames[(active + 1) % frames.length];
    if (!next?.mediaId) return;
    const image = new window.Image();
    image.src = mediaSrc(next.mediaId);
  }, [active, frames, videoMediaId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoMediaId || !video) return;
    if (!playing || !inView) {
      video.pause();
      return;
    }
    video.play().catch(() => {});
  }, [inView, playing, videoMediaId]);

  if (videoMediaId) {
    return <div ref={rootRef} className={`relative overflow-hidden bg-black ${className}`} data-testid="saved-memory-reel">
      <video
        ref={videoRef}
        src={mediaSrc(videoMediaId)}
        muted={videoMuted}
        loop
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/5 to-black/30" />
      <button type="button" onClick={() => setVideoMuted(value => !value)} aria-label={videoMuted ? 'Unmute saved Memory Reel' : 'Mute saved Memory Reel'} className="absolute left-3 top-7 z-20 inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur">{videoMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}{videoMuted ? 'Tap for sound' : 'Sound on'}</button>
      <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause saved Memory Reel' : 'Play saved Memory Reel'} className="absolute right-3 top-7 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 ${compact ? 'p-3' : 'p-5'}`}>
        {showTitle && <><p className={`${compact ? 'text-[10px]' : 'text-xs'} font-black text-pink-100/80`}>{story?.kicker}</p><h3 className={`${compact ? 'mt-0.5 text-lg' : 'mt-1 text-2xl'} font-black leading-tight`}>{story?.title}</h3></>}
        {!showTitle && showMutedBadge && <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/85 backdrop-blur">{videoMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}Saved Memory Reel</div>}
      </div>
    </div>;
  }

  if (!frames.length) return <div className={`relative grid place-items-center overflow-hidden bg-white/[0.04] ${className}`}><span className="text-xs font-bold text-white/30">Story preview unavailable</span></div>;
  const frame = frames[active % frames.length];

  return <div ref={rootRef} className={`relative overflow-hidden bg-black ${className}`} data-testid="smart-story-reel">
    <img key={`${frame.mediaId}:${active}`} src={mediaSrc(frame.mediaId)} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ animation: reducedMotion ? 'none' : 'snapnextStoryMotion 3.6s ease-out both' }} />
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/25" />
    <div className="absolute inset-x-3 top-3 z-10 flex gap-1" aria-hidden="true">{frames.map((entry, index) => <span key={`${entry.mediaId}:${index}`} className={`h-1 flex-1 rounded-full ${index < active ? 'bg-white/75' : index === active ? 'bg-white' : 'bg-white/25'}`} />)}</div>
    {showMutedBadge && <div className="absolute left-3 top-7 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/85 backdrop-blur"><VolumeX className="h-3 w-3" />Memory reel · muted</div>}
    <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause memory reel' : 'Play memory reel'} className="absolute right-3 top-7 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
    <div className={`absolute inset-x-0 bottom-0 ${compact ? 'p-3' : 'p-5'}`}>
      {showTitle && <><p className={`${compact ? 'text-[10px]' : 'text-xs'} font-black text-pink-100/80`}>{story?.kicker}</p><h3 className={`${compact ? 'mt-0.5 text-lg' : 'mt-1 text-2xl'} font-black leading-tight`}>{story?.title}</h3></>}
      {frame.caption && <p className={`${showTitle ? 'mt-1' : ''} line-clamp-2 ${compact ? 'text-[11px] leading-4' : 'text-sm leading-5'} text-white/72`}>{frame.caption}</p>}
    </div>
    <style>{`@keyframes snapnextStoryMotion { 0% { opacity:.25; transform:scale(1.075); } 12% { opacity:1; } 100% { opacity:1; transform:scale(1); } }`}</style>
  </div>;
}
