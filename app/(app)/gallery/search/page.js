'use client';

import { useState } from 'react';
import { Loader2, Play, Search, Sparkles } from 'lucide-react';

import LibraryTabs from '@/components/LibraryTabs';
import { apiFetch } from '@/lib/api-client';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';

const PRESETS = [
  { id: 'videos', label: 'Videos' },
  { id: 'last-summer', label: 'Last summer' },
  { id: '2024', label: '2024' },
];

function resultId(item = {}) {
  return String(item.id || item.mediaId || item.media_id || '');
}

function ResultTile({ item }) {
  const id = resultId(item);
  const isVideo = item.kind === 'video' || item.mediaType === 'video';
  return (
    <article className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035]">
      <div className="relative aspect-square bg-white/[0.03]">
        {id && !isVideo ? <img src={galleryThumbnailSrc(id, 480)} alt={item.name || 'Search result'} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
        {isVideo ? <div className="absolute inset-0 grid place-items-center"><span className="grid h-11 w-11 place-items-center rounded-full bg-black/45"><Play className="h-5 w-5 fill-white" /></span></div> : null}
      </div>
      <div className="p-3">
        <p className="truncate text-xs font-black">{item.name || item.title || 'Memory'}</p>
        {item.description ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/40">{item.description}</p> : null}
      </div>
    </article>
  );
}

export default function LibrarySearchPage() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: false, error: '', items: [], label: '' });

  async function runPreset(preset, label) {
    setState({ loading: true, error: '', items: [], label });
    try {
      const data = await apiFetch(`/magic-library/search?preset=${encodeURIComponent(preset)}`);
      setState({ loading: false, error: '', items: Array.isArray(data?.items) ? data.items : [], label: data?.query || label });
    } catch (error) {
      setState({ loading: false, error: error?.message || 'Search could not load.', items: [], label });
    }
  }

  async function askLibrary(event) {
    event?.preventDefault?.();
    const text = query.trim();
    if (!text) return;
    setState({ loading: true, error: '', items: [], label: text });
    try {
      // This is intentionally the paid/semantic path. It runs only after the
      // user submits a natural-language Ask Library query, and the server route
      // reserves/settles through ai-spend-gate before embedding the query.
      const data = await apiFetch(`/ai-index/search?smart=true&limit=40&q=${encodeURIComponent(text)}`);
      setState({ loading: false, error: '', items: Array.isArray(data?.results) ? data.results : [], label: text });
    } catch (error) {
      setState({ loading: false, error: error?.message || 'Ask Library could not search right now.', items: [], label: text });
    }
  }

  return (
    <div className="mx-auto max-w-6xl pb-32 md:pb-12">
      <header className="mb-6">
        <h1 className="text-[28px] font-black tracking-tight">Search</h1>
        <p className="mt-0.5 text-sm text-white/45">Find a known group instantly, or ask your library in natural language.</p>
        <div className="mt-4"><LibraryTabs /></div>
      </header>

      <main>
        <form onSubmit={askLibrary} role="search" className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/35" aria-hidden="true" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Ask your library"
            placeholder="Ask your library…"
            data-testid="ask-library-input"
            className="h-14 w-full rounded-full border border-white/10 bg-white/[0.045] pl-12 pr-32 text-sm outline-none placeholder:text-white/30 focus:border-pink-400/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"
          />
          <button
            type="submit"
            disabled={!query.trim() || state.loading}
            data-testid="ask-library-submit"
            className="absolute right-2 top-1/2 inline-flex min-h-10 -translate-y-1/2 items-center gap-2 rounded-full bg-white px-4 text-xs font-black text-black disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Ask Library
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick searches">
          {PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => runPreset(preset.id, preset.label)}
              data-testid={`library-search-preset-${preset.id}`}
              className="min-h-10 rounded-full border border-white/9 bg-white/[0.035] px-4 text-xs font-black text-white/60 transition hover:text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <section className="mt-7" aria-live="polite">
          {state.loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-white/45"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Searching…</div>
          ) : state.error ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{state.error}</div>
          ) : state.label ? (
            <>
              <div className="mb-3 flex items-end justify-between gap-4">
                <h2 className="text-xl font-black tracking-tight">{state.label}</h2>
                <span className="text-xs font-bold text-white/35">{state.items.length} results</span>
              </div>
              {state.items.length ? (
                <div data-testid="library-search-results" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {state.items.map((item, index) => <ResultTile key={resultId(item) || `${state.label}-${index}`} item={item} />)}
                </div>
              ) : (
                <div className="rounded-[24px] border border-white/9 bg-white/[0.03] px-5 py-10 text-center text-sm text-white/45">No matching memories found.</div>
              )}
            </>
          ) : (
            <div className="rounded-[24px] border border-white/8 bg-white/[0.025] px-5 py-10 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-pink-200/70" />
              <p className="mt-3 text-sm font-black">Search starts with you</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-white/40">Quick chips use stored metadata only. Ask Library runs semantic retrieval only when you submit a question.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
