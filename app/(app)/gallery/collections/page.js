'use client';

import { useEffect, useState } from 'react';
import { Camera, Images, Loader2, Monitor, Play, Star } from 'lucide-react';

import LibraryTabs from '@/components/LibraryTabs';
import { apiFetch } from '@/lib/api-client';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';

const COLLECTIONS = [
  { id: 'photos', label: 'Photos', icon: Camera, copy: 'Your backed-up photos' },
  { id: 'videos', label: 'Videos', icon: Play, copy: 'All saved videos' },
  { id: 'favorites', label: 'Favorites', icon: Star, copy: 'Memories you starred' },
  { id: 'screenshots', label: 'Screenshots', icon: Monitor, copy: 'Deterministic matches only' },
];

function Tile({ item }) {
  if (item.kind === 'video') {
    return (
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.07] to-white/[0.02]">
        <div className="absolute inset-0 grid place-items-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-black/45"><Play className="h-5 w-5 fill-white" /></span></div>
        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-black">Video</span>
      </div>
    );
  }
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035]">
      <img src={galleryThumbnailSrc(item.id, 480)} alt={item.name || 'Library item'} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      {(item.favorite || item.isFavorite) ? <Star className="absolute right-2 top-2 h-4 w-4 fill-pink-400 text-pink-400 drop-shadow" aria-label="Favorite" /> : null}
    </div>
  );
}

export default function LibraryCollectionsPage() {
  const [selected, setSelected] = useState('photos');
  const [state, setState] = useState({ loading: true, error: '', items: [] });

  useEffect(() => {
    let cancelled = false;
    setState(current => ({ ...current, loading: true, error: '' }));
    apiFetch(`/magic-library/collections?type=${encodeURIComponent(selected)}&limit=120`)
      .then(data => {
        if (cancelled) return;
        setState({ loading: false, error: '', items: Array.isArray(data?.items) ? data.items : [] });
      })
      .catch(error => {
        if (cancelled) return;
        setState({ loading: false, error: error?.message || 'Collection could not load.', items: [] });
      });
    return () => { cancelled = true; };
  }, [selected]);

  const current = COLLECTIONS.find(item => item.id === selected) || COLLECTIONS[0];

  return (
    <div className="mx-auto max-w-6xl pb-32 md:pb-12">
      <header className="mb-6">
        <h1 className="text-[28px] font-black tracking-tight">Collections</h1>
        <p className="mt-0.5 text-sm text-white/45">Simple views built from facts already stored in your library.</p>
        <div className="mt-4"><LibraryTabs /></div>
      </header>

      <main>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="list" aria-label="Library collections">
          {COLLECTIONS.map(({ id, label, icon: Icon, copy }) => {
            const active = selected === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                aria-pressed={active}
                data-testid={`collection-${id}`}
                className={`min-h-28 rounded-[24px] border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${active ? 'border-pink-400/35 bg-pink-500/12' : 'border-white/9 bg-white/[0.035] hover:bg-white/[0.055]'}`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-pink-200' : 'text-white/55'}`} aria-hidden="true" />
                <div className="mt-4 text-sm font-black">{label}</div>
                <div className="mt-1 text-xs text-white/40">{copy}</div>
              </button>
            );
          })}
        </div>

        <section className="mt-7" aria-labelledby="collection-heading">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 id="collection-heading" className="text-xl font-black tracking-tight">{current.label}</h2>
              <p className="mt-1 text-xs text-white/40">{state.loading ? 'Loading…' : `${state.items.length} loaded`}</p>
            </div>
          </div>

          {state.loading ? (
            <div className="flex min-h-36 items-center justify-center text-sm text-white/45"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading collection…</div>
          ) : state.error ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{state.error}</div>
          ) : state.items.length === 0 ? (
            <div className="rounded-[24px] border border-white/9 bg-white/[0.03] px-5 py-10 text-center">
              <Images className="mx-auto h-6 w-6 text-white/35" />
              <p className="mt-3 text-sm font-black">Nothing in {current.label.toLowerCase()} yet</p>
              <p className="mt-1 text-xs leading-5 text-white/40">This collection only shows items SnapNext can classify deterministically in V1.</p>
            </div>
          ) : (
            <div data-testid="collection-grid" className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {state.items.map(item => <Tile key={item.id} item={item} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
