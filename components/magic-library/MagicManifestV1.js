'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Loader2, Play, Sparkles, Star } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';
import MagicHighlightPlayer from './MagicHighlightPlayer';

function CardIcon({ type }) {
  if (type === 'videos') return <Play className="h-4 w-4 fill-current" aria-hidden="true" />;
  if (type === 'favorites') return <Star className="h-4 w-4 fill-current" aria-hidden="true" />;
  return <CalendarDays className="h-4 w-4" aria-hidden="true" />;
}

function MagicCard({ card, onPlay }) {
  const cover = card?.cover_asset_id;
  return (
    <button
      type="button"
      onClick={() => onPlay(card)}
      data-testid={`magic-card-${card.card_key || card.card_id}`}
      className="group relative min-h-[280px] w-[82vw] max-w-[390px] shrink-0 snap-start overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045] text-left shadow-2xl shadow-black/25 sm:w-[360px]"
    >
      {cover ? <img src={galleryThumbnailSrc(cover, 900)} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" loading="lazy" decoding="async" /> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/5" aria-hidden="true" />
      <div className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur"><Play className="ml-0.5 h-5 w-5 fill-current" /></div>
      <div className="relative flex min-h-[280px] flex-col justify-end p-5">
        <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white/85 backdrop-blur"><CardIcon type={card.type} /><span>Magic</span></div>
        <h2 className="max-w-[18ch] text-2xl font-black tracking-tight text-white">{card.title}</h2>
        {card.subtitle ? <p className="mt-1.5 text-sm font-bold text-white/72">{card.subtitle}</p> : null}
        <p className="mt-3 text-xs font-bold text-white/65">Tap to play</p>
      </div>
    </button>
  );
}

function StarterState({ reason }) {
  const pending = reason === 'manifest_pending';
  return <section data-testid="magic-starter" className="rounded-[28px] border border-white/10 bg-white/[0.035] px-5 py-10 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-200"><Sparkles className="h-5 w-5" /></div><h2 className="mt-4 text-xl font-black">Magic grows with your library</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/50">{pending ? 'Your library is ready to browse now. Magic highlights will appear after SnapNext prepares enough reliable groups in the background.' : 'There are not enough distinct groups for a useful Magic view yet. All remains your complete library.'}</p></section>;
}

export default function MagicManifestV1() {
  const [state, setState] = useState({ loading: true, error: '', availability: 'starter', reason: 'manifest_pending', cards: [], assets: [] });
  const [active, setActive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/magic-library/manifest').then(data => {
      if (cancelled) return;
      setState({ loading: false, error: '', availability: data?.availability || 'starter', reason: data?.reason || null, cards: Array.isArray(data?.cards) ? data.cards : [], assets: Array.isArray(data?.assets) ? data.assets : [] });
    }).catch(error => {
      if (!cancelled) setState(current => ({ ...current, loading: false, error: error?.message || 'Magic could not load right now.' }));
    });
    return () => { cancelled = true; };
  }, []);

  if (state.loading) return <div data-testid="magic-loading" className="flex min-h-48 items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.025] text-sm text-white/45"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing Magic…</div>;
  if (state.error) return <section data-testid="magic-error" className="rounded-[28px] border border-rose-300/20 bg-rose-400/10 p-5"><h2 className="font-black text-rose-50">Magic is temporarily unavailable</h2><p className="mt-1 text-sm text-rose-100/70">{state.error}</p></section>;
  if (state.availability !== 'ready') return <StarterState reason={state.reason} />;

  return <><section aria-labelledby="magic-for-you-heading"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-pink-300/75">Prepared from your library</p><h2 id="magic-for-you-heading" className="mt-1 text-2xl font-black">For you</h2></div><span className="text-xs font-bold text-white/35">{state.cards.length} highlights</span></div><div data-testid="magic-card-deck" className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">{state.cards.map(card => <MagicCard key={card.card_id || card.card_key} card={card} onPlay={setActive} />)}</div></section>{active ? <MagicHighlightPlayer card={active} assets={state.assets} onClose={() => setActive(null)} /> : null}</>;
}
