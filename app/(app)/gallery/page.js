'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, isPreviewDemo, mediaSrc } from '@/lib/api-client';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';
import {
  galleryRestoreNeedsMore,
  gallerySessionKey,
  normalizeGallerySessionState,
} from '@/lib/gallery-window';
import { useAccessibleDialog } from '@/hooks/use-escape-close';
import { groupByDay } from '@/lib/media-day-groups';
import LibraryTabs from '@/components/LibraryTabs';
import VirtualizedDayGrid from '@/components/gallery/VirtualizedDayGrid';
import { toast } from 'sonner';
import {
  Check, Download, FileText, HardDrive, Images, Loader2, Play, Search,
  Sparkles, Star, Trash2, Upload, X,
} from 'lucide-react';

// "People" is deliberately absent: organising by person is what the Magic tab
// does, and duplicating it here is what made the two views feel like one place.
const CHIPS = [
  ['all', 'All'],
  ['photo', 'Photos'],
  ['video', 'Videos'],
  ['favorite', 'Starred'],
  ['places', 'Places'],
  ['events', 'Events'],
];

function safe(value) { return value && typeof value === 'object' ? value : {}; }
function dateLabel(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
}
function captureDateValue(item) {
  return item?.capturedAt || item?.takenAt || item?.mediaCreatedAt || item?.createdAt || '';
}
function backupDateValue(item) {
  return item?.uploadedAt || item?.createdAt || '';
}
function metadataList(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function matchesCollection(item, collection) {
  if (collection === 'places') return metadataList(item?.aiAnalysis?.locations).length > 0;
  if (collection === 'events') {
    const events = metadataList(item?.aiAnalysis?.events);
    const tags = metadataList(item?.aiAnalysis?.tags).join(' ');
    return events.length > 0 || /birthday|wedding|festival|celebration|trip|holiday|event/i.test(`${tags} ${item?.name || ''}`);
  }
  return true;
}

export default function GalleryPage() {
  const [items, setItems] = useState([]);
  const [collection, setCollection] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [meaningBusy, setMeaningBusy] = useState(false);
  const [meaningTried, setMeaningTried] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);

  async function load({ append = false, cursor = '' } = {}) {
    append ? setLoadingMore(true) : setLoading(true);
    setLoadError('');
    if (!append) {
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setMeaningTried(false);
    }

    const params = new URLSearchParams({
      view: 'gallery',
      filter: collection,
      limit: '60',
    });
    if (search) params.set('q', search);
    if (cursor) params.set('cursor', cursor);

    try {
      // Preview mode has three local sample memories and deliberately skips the
      // server cursor contract because there is no real account library behind it.
      const mediaData = safe(await apiFetch(isPreviewDemo() ? '/media' : `/media?${params}`));
      const incoming = Array.isArray(mediaData.items) ? mediaData.items : [];
      setItems(current => {
        if (!append) return incoming;
        const existing = new Set(current.map(item => item.id));
        return [...current, ...incoming.filter(item => !existing.has(item.id))];
      });
      setNextCursor(mediaData.nextCursor || null);
      setHasMore(Boolean(mediaData.hasMore && mediaData.nextCursor));
    } catch (error) {
      const message = error.message || 'Library could not load.';
      setLoadError(message);
      if (!append) toast.error(message);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }

  // Searching by meaning calls an AI model, so it is never automatic. Ordinary
  // searching stays free and instant; this runs only when someone asks for it
  // after the plain search came up short.
  async function searchByMeaning() {
    setMeaningBusy(true);
    try {
      const found = await apiFetch(`/ai-index/search?smart=true&q=${encodeURIComponent(search)}`);
      const results = Array.isArray(found?.results) ? found.results : [];
      setMeaningTried(true);
      setLoadError('');
      setHasMore(false);
      setNextCursor(null);
      if (!results.length) {
        setItems([]);
        toast.message('Still nothing close. Try different words.');
        return;
      }
      setItems(results);
      toast.success(`Found ${results.length} ${results.length === 1 ? 'memory' : 'memories'} by meaning.`);
    } catch (error) {
      toast.error(error.message || 'Could not search by meaning.');
    } finally {
      setMeaningBusy(false);
    }
  }

  useEffect(() => {
    let saved = null;
    if (typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(gallerySessionKey({ filter: collection, search }));
        if (raw) saved = normalizeGallerySessionState(JSON.parse(raw));
      } catch {
        saved = null;
      }
    }
    setRestoreTarget(saved && (saved.scrollY > 0 || saved.loadedCount > 60) ? saved : null);
    load();
  }, [collection, search]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const key = gallerySessionKey({ filter: collection, search });
    let frame = 0;

    const save = () => {
      frame = 0;
      try {
        const snapshot = normalizeGallerySessionState({ scrollY: window.scrollY, loadedCount: items.length });
        window.sessionStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        // Session restoration is a convenience only. Library browsing must never
        // fail because storage is blocked or full.
      }
    };
    const scheduleSave = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(save);
    };

    window.addEventListener('scroll', scheduleSave, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('scroll', scheduleSave);
      window.removeEventListener('pagehide', save);
      if (frame) window.cancelAnimationFrame(frame);
      save();
    };
  }, [collection, search, items.length]);

  useEffect(() => {
    if (!restoreTarget || typeof window === 'undefined') return undefined;
    // A failed restore page must stop automatic replay. The normal retry button
    // remains available, but return-position convenience can never loop requests.
    if (loadError) {
      setRestoreTarget(null);
      return undefined;
    }
    if (galleryRestoreNeedsMore({
      target: restoreTarget,
      loadedCount: items.length,
      hasMore,
      nextCursor,
      loading,
      loadingMore,
    })) {
      load({ append: true, cursor: nextCursor });
      return undefined;
    }
    if (loading || loadingMore) return undefined;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: restoreTarget.scrollY, behavior: 'auto' });
      setRestoreTarget(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [restoreTarget, items.length, hasMore, nextCursor, loading, loadingMore, loadError]);

  const visibleItems = useMemo(() => items.filter(item => matchesCollection(item, collection)), [items, collection]);
  const dayGroups = useMemo(() => groupByDay(visibleItems), [visibleItems]);
  const submitSearch = value => setSearch(String(value ?? query).trim());
  const chooseCollection = id => { setCollection(id); setSelected(new Set()); };
  const clearAll = () => { setCollection('all'); setQuery(''); setSearch(''); setSelected(new Set()); };
  const toggle = id => setSelected(current => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectMode = () => setSelectMode(current => {
    if (current) setSelected(new Set());
    return !current;
  });
  const star = async id => {
    await apiFetch(`/media/${id}/favorite`, { method: 'POST' });
    setItems(current => current.flatMap(item => {
      if (item.id !== id) return [item];
      const favorite = !(item.favorite || item.isFavorite);
      if (collection === 'favorite' && !favorite) return [];
      return [{ ...item, favorite, isFavorite: favorite }];
    }));
    setViewer(current => {
      if (current?.id !== id) return current;
      const favorite = !(current.favorite || current.isFavorite);
      return { ...current, favorite, isFavorite: favorite };
    });
  };
  const trash = async id => {
    await apiFetch(`/media/${id}/trash`, { method: 'POST' });
    setItems(current => current.filter(item => item.id !== id));
    setSelected(current => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setViewer(null);
    toast.success('Moved to trash.');
  };
  const download = async item => {
    const response = await fetch(mediaSrc(item.id));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.name || 'memory';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const bulk = async action => {
    if (!selected.size) return;
    const ids = new Set(selected);
    await apiFetch('/media/bulk', { method: 'POST', body: JSON.stringify({ ids: [...ids], action }) });
    if (action === 'trash') {
      setItems(current => current.filter(item => !ids.has(item.id)));
    } else if (action === 'favorite') {
      setItems(current => current.map(item => ids.has(item.id) ? { ...item, favorite: true, isFavorite: true } : item));
    }
    setSelected(new Set());
    toast.success('Library updated.');
  };

  return (
    <div className="mx-auto max-w-6xl pb-32 md:pb-12">
      <header data-testid="library-header" className="sticky top-14 z-20 -mx-4 mb-4 border-b border-white/5 bg-[#0b0414]/92 px-4 pb-3 pt-1 backdrop-blur-xl md:top-0 md:-mx-8 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-4">
            <div><h1 className="text-[28px] font-black tracking-tight">Library</h1><p className="mt-0.5 text-sm text-white/45">Everything you have backed up, newest first.</p></div>
            <div className="flex items-center gap-2">
              <Link data-testid="library-cleanup-link" href="/gallery/cleanup" className="hidden min-h-11 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 sm:inline-flex"><HardDrive className="h-4 w-4" aria-hidden="true" />Free up space</Link>
              <button data-testid="library-select-toggle" onClick={toggleSelectMode} aria-pressed={selectMode} className={`min-h-11 rounded-full px-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${selectMode ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-white/70'}`}>{selectMode ? 'Cancel' : 'Select'}</button>
              <Link data-testid="library-upload-link" href="/upload" aria-label="Add photos and videos" className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><Upload className="h-4 w-4" /></Link>
            </div>
          </div>

          <div className="mt-4"><LibraryTabs /></div>

          <div className="relative mt-3" role="search">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/35" aria-hidden="true" />
            <input aria-label="Search your library" data-testid="library-search-input" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitSearch()} placeholder="Search by moment, person, place, or date" className="h-12 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-20 text-sm outline-none placeholder:text-white/30 focus:border-pink-400/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300" />
            {query ? <button data-testid="library-search-clear" aria-label="Clear search" onClick={() => { setQuery(''); setSearch(''); }} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><X className="h-4 w-4 text-white/55" /></button> : <button aria-label="Submit library search" data-testid="library-search-submit" onClick={() => submitSearch()} className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-black text-pink-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">Search</button>}
          </div>

          {/* Offered only when the free search came up short, and only on an
              explicit tap — searching by meaning costs a credit, so it is never
              something the app decides to spend on its own. */}
          {!loading && !!search && !meaningTried && visibleItems.length < 5 && (
            <div data-testid="library-meaning-prompt" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="text-sm text-white/55">{visibleItems.length ? 'Not what you meant?' : 'Nothing matched those words.'}</span>
              <button
                data-testid="library-search-by-meaning"
                onClick={searchByMeaning}
                disabled={meaningBusy}
                className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"
              >
                {meaningBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {meaningBusy ? 'Looking…' : 'Search by meaning'}
              </button>
            </div>
          )}

          <div data-testid="library-filter-row" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Library filters" tabIndex={0}>
            {CHIPS.map(([id, label]) => <button data-testid={`library-filter-${id}`} key={id} onClick={() => chooseCollection(id)} aria-pressed={collection === id} className={`h-10 shrink-0 rounded-full border px-4 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${collection === id ? 'border-pink-400/45 bg-pink-500/15 text-pink-200' : 'border-white/8 bg-white/[0.035] text-white/55'}`}>{label}</button>)}
          </div>

          {selectMode && <div data-testid="library-selection-bar" className="mt-3 flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3" aria-live="polite"><span className="text-sm font-black">{selected.size} selected</span><div className="ml-auto flex gap-2"><button data-testid="library-bulk-favorite" disabled={!selected.size} onClick={() => bulk('favorite')} className="min-h-10 rounded-full bg-white/7 px-3 py-2 text-xs font-black disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">Star</button><button data-testid="library-bulk-trash" disabled={!selected.size} onClick={() => bulk('trash')} className="min-h-10 rounded-full bg-white/7 px-3 py-2 text-xs font-black disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">Trash</button></div></div>}
        </div>
      </header>

      <p className="sr-only" aria-live="polite">{loading ? 'Loading library.' : `${visibleItems.length} memories loaded.`}</p>
      <main data-testid="library-grid-region" aria-busy={loading || loadingMore}>
        {loading ? <div className="grid grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-hidden="true">{Array.from({ length: 12 }).map((_, index) => <div key={index} className="aspect-square animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
          : visibleItems.length === 0 && !loadError ? <Empty filtered={collection !== 'all' || !!search} onClear={clearAll} />
            : <div data-testid="library-grid" aria-label="Memory library">
              <VirtualizedDayGrid
                groups={dayGroups}
                renderItem={item => <MemoryCard key={item.id} item={item} selectMode={selectMode} selected={selected.has(item.id)} onSelect={() => toggle(item.id)} onOpen={() => setViewer(item)} />}
              />
            </div>}

        {loadError && <div data-testid="library-load-error" className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-center"><p className="text-sm text-rose-100">{loadError}</p><button onClick={() => load({ append: items.length > 0, cursor: items.length > 0 ? nextCursor || '' : '' })} className="mt-3 min-h-11 rounded-full bg-white px-5 text-sm font-black text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">Try again</button></div>}
        {!loading && !loadError && hasMore && <button data-testid="library-load-more" onClick={() => load({ append: true, cursor: nextCursor })} disabled={loadingMore} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] text-sm font-black text-white/75 disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">{loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" />Loading more…</> : 'Load more memories'}</button>}
        {!loading && !loadError && !hasMore && visibleItems.length > 0 && <p data-testid="library-end" className="mt-6 text-center text-xs font-bold text-white/30">All loaded.</p>}
      </main>

      {viewer && <Viewer item={viewer} onClose={() => setViewer(null)} onStar={() => star(viewer.id)} onDownload={() => download(viewer)} onTrash={() => trash(viewer.id)} />}
    </div>
  );
}

function Media({ item, className = '', preview = false }) {
  if (item.kind === 'photo') {
    const src = preview ? galleryThumbnailSrc(item.id, 480) : mediaSrc(item.id);
    return <img src={src} className={`${className} object-cover`} alt={item.name || 'Memory'} loading={preview ? 'lazy' : 'eager'} decoding="async" sizes={preview ? '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 17vw' : undefined} />;
  }
  if (item.kind === 'video') {
    if (preview) return <div className={`relative grid place-items-center bg-gradient-to-br from-white/[0.06] to-white/[0.02] ${className}`} aria-label={item.name || 'Memory video'}><div className="grid h-12 w-12 place-items-center rounded-full bg-black/55"><Play className="h-6 w-6 fill-white" aria-hidden="true" /></div></div>;
    return <div className={`relative ${className}`}><video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted playsInline controls preload="metadata" aria-label={item.name || 'Memory video'} /><div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/5" aria-hidden="true" /></div>;
  }
  return <div className={`grid place-items-center bg-white/5 p-4 text-center ${className}`} aria-label={item.name || 'Text memory'}><FileText className="h-8 w-8 text-white/45" /></div>;
}

function MemoryCard({ item, selectMode, selected, onSelect, onOpen }) {
  const open = () => selectMode ? onSelect() : onOpen();
  const label = selectMode ? `${selected ? 'Deselect' : 'Select'} ${item.name || 'memory'}` : `Open ${item.name || 'memory'}`;
  return <button aria-label={label} aria-pressed={selectMode ? selected : undefined} data-testid={`library-media-${item.id}`} onClick={open} className={`relative aspect-square overflow-hidden rounded-xl bg-white/[0.035] text-left ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${selected ? 'ring-2 ring-pink-400' : 'ring-0'}`}><Media item={item} className="h-full w-full" preview />{(item.favorite || item.isFavorite) && <Star className="absolute right-2 top-2 h-4 w-4 fill-pink-400 text-pink-400 drop-shadow" aria-label="Starred" />}{item.kind === 'video' && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black"><Play className="h-3 w-3 fill-white" aria-hidden="true" />Video</span>}{selectMode && <span aria-hidden="true" className={`absolute left-2 top-2 grid h-[22px] w-[22px] place-items-center rounded-full border-2 ${selected ? 'border-pink-400 bg-pink-500' : 'border-white bg-black/30'}`}>{selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}</span>}</button>;
}

function Viewer({ item, onClose, onStar, onDownload, onTrash }) {
  const people = metadataList(item?.aiAnalysis?.faces);
  const places = metadataList(item?.aiAnalysis?.locations);
  const description = item?.aiAnalysis?.description || item?.aiAnalysis?.summary || '';
  const takenLabel = dateLabel(captureDateValue(item)) || 'Date not available';
  const backedUpLabel = dateLabel(backupDateValue(item)) || 'Date not available';
  const context = [places[0], people.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
  const titleId = `library-viewer-title-${item.id}`;
  const dialogRef = useAccessibleDialog(true, onClose);
  return (
    <div data-testid="library-viewer" className="fixed inset-0 z-50 overflow-y-auto bg-black/95 p-3 backdrop-blur-xl" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mx-auto grid min-h-full max-w-4xl place-items-center">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0711] outline-none">
          <div className="relative grid min-h-[45vh] place-items-center bg-black">
            <Media item={item} className="max-h-[70vh] w-full" />
            <button data-testid="library-viewer-close" aria-label="Close memory" onClick={onClose} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-5">
            <h2 id={titleId} className="text-2xl font-black">{item.name || 'Memory'}</h2>
            <div className="mt-2 space-y-1 text-sm text-white/50">
              <p data-testid="library-viewer-taken"><span className="font-bold text-white/70">Taken:</span> {takenLabel}</p>
              <p data-testid="library-viewer-backed-up"><span className="font-bold text-white/70">Backed up:</span> {backedUpLabel}</p>
              {context && <p data-testid="library-viewer-context">{context}</p>}
            </div>
            <Link data-testid="library-add-to-story" href="/ai-studio" className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 px-5 font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">Add to a story</Link>
            {description && <div data-testid="library-snapnext-take" className="mt-4 rounded-2xl border border-pink-300/10 bg-gradient-to-br from-pink-500/10 to-purple-500/8 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-pink-200">SnapNext&apos;s take</p><p className="mt-2 text-sm leading-6 text-white/60">{description}</p></div>}
            <div className="mt-5 grid grid-cols-3 gap-2"><Action testId="library-viewer-favorite" icon={Star} label="Star" onClick={onStar} /><Action testId="library-viewer-download" icon={Download} label="Save" onClick={onDownload} /><Action testId="library-viewer-trash" icon={Trash2} label="Trash" onClick={onTrash} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Action({ testId, icon: Icon, label, onClick }) {
  return <button data-testid={testId} onClick={onClick} className="min-h-16 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><Icon className="mx-auto mb-1.5 h-5 w-5" aria-hidden="true" />{label}</button>;
}

function Empty({ filtered, onClear }) {
  return <div data-testid="library-empty" className="rounded-[2rem] border border-dashed border-white/12 bg-white/[0.025] p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/[0.05]"><Images className="h-6 w-6 text-white/35" aria-hidden="true" /></div><h3 className="mt-4 text-xl font-black">Nothing here yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">{filtered ? 'Try a different search, or clear the filter to see all your moments.' : 'Back up photos and videos and they will appear here.'}</p>{filtered ? <button data-testid="library-empty-clear" onClick={onClear} className="mt-5 min-h-11 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">Clear filters</button> : <Link data-testid="library-empty-upload" href="/upload" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 py-2.5 text-sm font-black text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">Back up memories</Link>}</div>;
}
