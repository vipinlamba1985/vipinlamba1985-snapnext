'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import useMagicLibrary from '@/components/magic-library/useMagicLibrary';
import MediaViewer from '@/components/magic-library/MediaViewer';
import { mediaSrc } from '@/lib/api-client';

const GRID_CLASSES = {
  small: 'grid-cols-5 md:grid-cols-8 lg:grid-cols-10',
  medium: 'grid-cols-3 md:grid-cols-5 lg:grid-cols-7',
  large: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5',
};

function photoDate(item) {
  const raw = item?.capturedAt || item?.takenAt || item?.mediaCreatedAt || item?.createdAt || item?.uploadedAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : new Date(0);
}

function dateKey(date) {
  if (date.getTime() === 0) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateTitle(date) {
  if (date.getTime() === 0) return 'Date not available';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(date) === dateKey(today)) return 'Today';
  if (dateKey(date) === dateKey(yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

export default function AllPhotosTimeline() {
  const magic = useMagicLibrary();
  const [gridSize, setGridSize] = useState('medium');
  const [viewer, setViewer] = useState(null);

  const photos = useMemo(() => [...magic.items]
    .filter((item) => item.kind === 'photo')
    .sort((a, b) => photoDate(b) - photoDate(a)), [magic.items]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of photos) {
      const date = photoDate(item);
      const key = dateKey(date);
      if (!map.has(key)) map.set(key, { key, date, items: [] });
      map.get(key).items.push(item);
    }
    return [...map.values()];
  }, [photos]);

  if (magic.busy) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-pink-300" /></div>;

  return (
    <div className="space-y-5 pb-24">
      <header className="sticky top-0 z-30 -mx-3 border-b border-white/10 bg-[#08030d]/95 px-3 pb-3 pt-2 backdrop-blur-xl md:mx-0 md:rounded-2xl md:border">
        <div className="flex items-center gap-3">
          <Link href="/magic-library" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06]" aria-label="Back to Magic Library"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1"><h1 className="text-xl font-black text-white md:text-2xl">All photos</h1><p className="text-xs text-white/45">Newest first · {photos.length} photos</p></div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] p-1">
            <button onClick={() => setGridSize('small')} className={`grid h-9 w-9 place-items-center rounded-full ${gridSize === 'small' ? 'bg-white text-black' : 'text-white/60'}`} aria-label="Smaller photos"><ZoomOut className="h-4 w-4" /></button>
            <button onClick={() => setGridSize('medium')} className={`h-9 rounded-full px-3 text-[11px] font-black ${gridSize === 'medium' ? 'bg-white text-black' : 'text-white/60'}`}>Fit</button>
            <button onClick={() => setGridSize('large')} className={`grid h-9 w-9 place-items-center rounded-full ${gridSize === 'large' ? 'bg-white text-black' : 'text-white/60'}`} aria-label="Larger photos"><ZoomIn className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      {!groups.length ? <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-white/30" /><h2 className="mt-3 text-xl font-black">No photos yet</h2><p className="mt-1 text-sm text-white/45">Uploaded photos will appear here in date order.</p></div> : groups.map((group) => (
        <section key={group.key}>
          <div className="mb-2"><h2 className="text-base font-black text-white md:text-lg">{dateTitle(group.date)}</h2><p className="text-[11px] text-white/38">{group.items.length} {group.items.length === 1 ? 'photo' : 'photos'}</p></div>
          <div className={`grid gap-1.5 md:gap-2 ${GRID_CLASSES[gridSize]}`}>
            {group.items.map((item) => {
              const index = photos.findIndex((photo) => photo.id === item.id);
              return <button key={item.id} onClick={() => setViewer({ item, index })} className="aspect-square overflow-hidden rounded-lg bg-white/5 md:rounded-xl"><img src={mediaSrc(item.id)} alt={item.name || 'Photo'} className="h-full w-full object-cover" loading="lazy" /></button>;
            })}
          </div>
        </section>
      ))}

      <MediaViewer item={viewer?.item} items={photos} index={viewer?.index || 0} onClose={() => setViewer(null)} onChanged={magic.reload} />
    </div>
  );
}
