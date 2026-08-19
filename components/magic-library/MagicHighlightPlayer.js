'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Music2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { mediaSrc } from '@/lib/api-client';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';
import { soundtrackForStory } from '@/lib/ready-story-audio';

const PHOTO_FRAME_MS = 4200;
const VIDEO_CLIP_MAX_SECONDS = 6;

export default function MagicHighlightPlayer({ card, assets = [], onClose }) {
  const ids = useMemo(
    () => (Array.isArray(card?.asset_ids) && card.asset_ids.length ? card.asset_ids : (card?.cover_asset_id ? [card.cover_asset_id] : [])),
    [card],
  );
  const metadata = useMemo(() => new Map((Array.isArray(assets) ? assets : []).map(item => [String(item.id), item])), [assets]);
  const frames = useMemo(() => ids.map(id => ({ id: String(id), ...(metadata.get(String(id)) || {}) })), [ids, metadata]);
  const soundtrack = useMemo(() => soundtrackForStory({ type: card?.type || 'memory' }), [card?.type]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const audioRef = useRef(null);
  const videoRef = useRef(null);

  const active = frames[index] || null;
  const activeIsVideo = active?.kind === 'video';

  const next = useCallback(() => {
    if (!frames.length) return;
    setVideoFailed(false);
    setIndex(current => (current + 1) % frames.length);
  }, [frames.length]);

  const previous = useCallback(() => {
    if (!frames.length) return;
    setVideoFailed(false);
    setIndex(current => (current - 1 + frames.length) % frames.length);
  }, [frames.length]);

  useEffect(() => {
    setIndex(0);
    setPlaying(true);
    setSoundOn(false);
    setSoundError(false);
    setVideoFailed(false);
  }, [card?.card_id, card?.card_key]);

  useEffect(() => {
    if (!playing || activeIsVideo || frames.length < 2) return undefined;
    const timer = window.setTimeout(next, PHOTO_FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [playing, activeIsVideo, index, frames.length, next]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeIsVideo || videoFailed) return undefined;
    video.muted = true;
    if (playing) video.play().catch(() => setVideoFailed(true));
    else video.pause();
    return () => video.pause();
  }, [activeIsVideo, index, playing, videoFailed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !soundOn) return;
    if (playing) audio.play().catch(() => { setSoundOn(false); setSoundError(true); });
    else audio.pause();
  }, [playing, soundOn]);

  useEffect(() => {
    const handler = event => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === ' ') { event.preventDefault(); setPlaying(value => !value); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, onClose, previous]);

  async function toggleSound() {
    const audio = audioRef.current;
    if (!audio || !soundtrack) return;
    if (soundOn) {
      audio.pause();
      setSoundOn(false);
      return;
    }
    setSoundError(false);
    audio.muted = false;
    audio.volume = 0.28;
    try {
      if (audio.readyState === 0) audio.load();
      await audio.play();
      setSoundOn(true);
    } catch {
      setSoundOn(false);
      setSoundError(true);
    }
  }

  if (!card || !active) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${card.title} Magic highlight`} className="fixed inset-0 z-[100] bg-black text-white">
      <div className="absolute inset-0 overflow-hidden">
        {activeIsVideo && !videoFailed ? (
          <video
            key={active.id}
            ref={videoRef}
            src={mediaSrc(active.id)}
            poster={galleryThumbnailSrc(active.id, 1200)}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            muted
            preload="metadata"
            onEnded={next}
            onError={() => setVideoFailed(true)}
            onTimeUpdate={event => { if (event.currentTarget.currentTime >= VIDEO_CLIP_MAX_SECONDS) next(); }}
          />
        ) : (
          <img
            key={active.id}
            src={galleryThumbnailSrc(active.id, 1200)}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover animate-[snapnextMagicKenBurns_4.2s_ease-out_both]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/80" />
      </div>

      {soundtrack ? (
        <audio ref={audioRef} loop preload="none" playsInline onError={() => { setSoundOn(false); setSoundError(true); }} aria-hidden="true">
          {soundtrack.mp3Url ? <source src={soundtrack.mp3Url} type="audio/mpeg" /> : null}
          {soundtrack.audioUrl ? <source src={soundtrack.audioUrl} type="audio/ogg" /> : null}
        </audio>
      ) : null}

      <div className="relative flex h-full flex-col p-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex gap-1" aria-label={`Memory ${index + 1} of ${frames.length}`}>
          {frames.map((frame, frameIndex) => (
            <span key={frame.id} className={`h-1 flex-1 rounded-full ${frameIndex <= index ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
        <div className="mt-3 flex justify-between">
          <button onClick={onClose} aria-label="Back to Magic" className="grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur"><ArrowLeft className="h-5 w-5" /></button>
          <button onClick={toggleSound} aria-label={soundOn ? 'Mute soundtrack' : 'Play soundtrack'} title={soundtrack ? `${soundtrack.title} · ${soundtrack.license}` : undefined} className="inline-flex h-11 items-center gap-2 rounded-full bg-black/40 px-3 backdrop-blur">
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            <span className="text-xs font-black">{soundOn ? 'Sound on' : soundError ? 'Retry' : 'Tap for sound'}</span>
          </button>
        </div>

        <button onClick={() => setPlaying(value => !value)} className="flex-1" aria-label={playing ? 'Pause highlight' : 'Play highlight'} />

        <div>
          <span className="rounded-full bg-black/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.16em]">Magic</span>
          <h1 className="mt-3 text-3xl font-black tracking-tight">{card.title}</h1>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white/70">{card.subtitle || `${frames.length} memories`}</p>
              {soundtrack ? <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/45"><Music2 className="h-3 w-3" />{soundtrack.title} · {soundtrack.license}</p> : null}
            </div>
            <button onClick={() => setPlaying(value => !value)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black" aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
          </div>
        </div>
      </div>

      <button onClick={previous} className="absolute bottom-28 left-0 top-20 w-1/4" aria-label="Previous memory" />
      <button onClick={next} className="absolute bottom-28 right-0 top-20 w-1/4" aria-label="Next memory" />
      <style>{`@keyframes snapnextMagicKenBurns { 0% { transform:scale(1.075); opacity:.35; } 12% { opacity:1; } 100% { transform:scale(1); opacity:1; } }`}</style>
    </div>
  );
}
