'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Sparkles, Volume2, VolumeX, Wifi } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';
import { soundtrackForStory } from '@/lib/ready-story-audio';
import MagicHighlightPlayer from './MagicHighlightPlayer';

const AUTOPLAY_KEY = 'snapnext:magic-autoplay:v1';
const FRAME_MS = 3800;
const POLICIES = ['wifi', 'always', 'off'];

function policyLabel(value) {
  if (value === 'always') return 'Autoplay: Always';
  if (value === 'off') return 'Autoplay: Off';
  return 'Autoplay: Wi-Fi';
}

function networkAllowsWifiPolicy() {
  if (typeof navigator === 'undefined') return true;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  if (connection.type && !['wifi', 'ethernet', 'unknown'].includes(String(connection.type))) return false;
  return !['slow-2g', '2g'].includes(String(connection.effectiveType || ''));
}

export default function MagicHomeHighlight() {
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const [data, setData] = useState({ card: null, assets: [] });
  const [index, setIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [batteryLow, setBatteryLow] = useState(false);
  const [policy, setPolicy] = useState('wifi');
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { setPolicy(localStorage.getItem(AUTOPLAY_KEY) || 'wifi'); } catch {}
    let cancelled = false;
    apiFetch('/magic-library/manifest').then(result => {
      if (cancelled || result?.availability !== 'ready' || !Array.isArray(result?.cards) || !result.cards.length) return;
      setData({ card: result.cards[0], assets: Array.isArray(result.assets) ? result.assets : [] });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(Boolean(query?.matches));
    sync();
    query?.addEventListener?.('change', sync);
    return () => query?.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!rootRef.current || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const observer = new IntersectionObserver(entries => setInView(Boolean(entries[0]?.isIntersecting && entries[0]?.intersectionRatio >= 0.45)), { threshold: [0, 0.45, 0.75] });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [data.card]);

  useEffect(() => {
    let mounted = true;
    navigator.getBattery?.().then(battery => {
      const sync = () => mounted && setBatteryLow(!battery.charging && battery.level <= 0.15);
      sync();
      battery.addEventListener?.('levelchange', sync);
      battery.addEventListener?.('chargingchange', sync);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const ids = useMemo(() => Array.isArray(data.card?.asset_ids) ? data.card.asset_ids.map(String) : [], [data.card]);
  const metadata = useMemo(() => new Map(data.assets.map(item => [String(item.id), item])), [data.assets]);
  const soundtrack = useMemo(() => soundtrackForStory({ type: data.card?.type || 'memory' }), [data.card?.type]);
  const autoplay = policy !== 'off' && !reducedMotion && !batteryLow && (policy === 'always' || networkAllowsWifiPolicy());

  useEffect(() => {
    if (!inView || !autoplay || ids.length < 2 || open) return undefined;
    const timer = window.setTimeout(() => setIndex(current => (current + 1) % ids.length), FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, ids.length, inView, index, open]);

  useEffect(() => {
    if (inView && !open) return;
    audioRef.current?.pause();
    setSoundOn(false);
  }, [inView, open]);

  function cyclePolicy() {
    const next = POLICIES[(POLICIES.indexOf(policy) + 1) % POLICIES.length];
    setPolicy(next);
    try { localStorage.setItem(AUTOPLAY_KEY, next); } catch {}
  }

  async function toggleSound(event) {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !soundtrack) return;
    if (soundOn) { audio.pause(); setSoundOn(false); return; }
    setSoundError(false);
    audio.volume = 0.24;
    try {
      if (audio.readyState === 0) audio.load();
      await audio.play();
      setSoundOn(true);
    } catch {
      setSoundOn(false);
      setSoundError(true);
    }
  }

  if (!data.card || !ids.length) return null;
  const activeId = ids[index % ids.length];
  const activeMeta = metadata.get(activeId);

  return <>
    <section ref={rootRef} data-testid="home-magic-highlight" className="space-y-3">
      <div className="flex items-end justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-pink-300/75">Made for you</p><h2 className="mt-1 text-[22px] font-black tracking-tight">Magic highlight</h2></div><Link href="/gallery/magic" className="text-sm font-bold text-pink-200">View all Magic</Link></div>
      <article className="relative h-[330px] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/25 md:h-[410px]">
        <img key={`${activeId}:${index}`} src={galleryThumbnailSrc(activeId, 1200)} alt="" decoding="async" className={`absolute inset-0 h-full w-full object-cover ${autoplay && inView ? 'animate-[snapnextHomeMagic_3.8s_ease-out_both]' : ''}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/30" />
        <div className="absolute inset-x-4 top-4 flex gap-1">{ids.slice(0, 10).map((id, frameIndex) => <span key={id} className={`h-1 flex-1 rounded-full ${frameIndex <= index ? 'bg-white' : 'bg-white/30'}`} />)}</div>
        <button onClick={() => setOpen(true)} className="absolute inset-0" aria-label={`Play ${data.card.title}`} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 md:p-6"><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Magic</div><h3 className="mt-3 text-2xl font-black md:text-3xl">{data.card.title}</h3><p className="mt-1 text-sm font-bold text-white/68">{data.card.subtitle || `${ids.length} memories`}{activeMeta?.kind === 'video' ? ' · video moment' : ''}</p></div>
        <button onClick={toggleSound} aria-label={soundOn ? 'Mute highlight soundtrack' : 'Play highlight soundtrack'} className="absolute right-4 top-9 z-20 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 text-xs font-black backdrop-blur">{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}<span>{soundOn ? 'Sound on' : soundError ? 'Retry sound' : 'Muted'}</span></button>
        <button onClick={() => setOpen(true)} aria-label="Play full highlight" className="absolute bottom-5 right-5 z-20 grid h-12 w-12 place-items-center rounded-full bg-white text-black"><Play className="ml-0.5 h-5 w-5 fill-current" /></button>
      </article>
      <div className="flex items-center justify-between gap-3 text-xs text-white/42"><span>{batteryLow ? 'Autoplay paused to save battery.' : reducedMotion ? 'Motion reduced by device preference.' : 'Photos and video posters animate without rendering a new file.'}</span><button onClick={cyclePolicy} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-3 font-bold text-white/60"><Wifi className="h-3.5 w-3.5" />{policyLabel(policy)}</button></div>
      {soundtrack ? <audio ref={audioRef} loop preload="none" playsInline aria-hidden="true" onError={() => { setSoundOn(false); setSoundError(true); }}>{soundtrack.mp3Url ? <source src={soundtrack.mp3Url} type="audio/mpeg" /> : null}{soundtrack.audioUrl ? <source src={soundtrack.audioUrl} type="audio/ogg" /> : null}</audio> : null}
      <style>{`@keyframes snapnextHomeMagic { 0% { transform:scale(1.07); opacity:.45; } 12% { opacity:1; } 100% { transform:scale(1); opacity:1; } }`}</style>
    </section>
    {open ? <MagicHighlightPlayer card={data.card} assets={data.assets} onClose={() => setOpen(false)} /> : null}
  </>;
}
