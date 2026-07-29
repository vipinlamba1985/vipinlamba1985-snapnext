'use client';

import { ChevronLeft, ChevronRight, Download, Heart, Plus, Send, Tag, Trash2, X } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { isScreenshotMedia, mediaCategory, mediaUserTags, screenshotType } from '@/lib/media-category';
import { useAccessibleDialog } from '@/hooks/use-escape-close';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';

const CATEGORY_LABELS = { photos: 'Photos', videos: 'Videos', screenshots: 'Screenshots', docs: 'Docs' };
const SCREENSHOT_TYPE_LABELS = { visual: 'Visual', info: 'Info', docs: 'Docs' };

export default function MediaViewer({ item, items = [], index = 0, onClose, onChanged }) {
  const [currentIndex, setCurrentIndex] = useState(index || 0);
  const [selectedCategory, setSelectedCategory] = useState('photos');
  const [selectedScreenshotType, setSelectedScreenshotType] = useState('info');
  const [screenshotMeta, setScreenshotMeta] = useState(null);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const list = useMemo(() => items.length ? items : item ? [item] : [], [items, item]);
  const current = list[currentIndex] || item;
  const screenshot = isScreenshotMedia(current);
  const dialogRef = useAccessibleDialog(!!current, onClose);

  useEffect(() => { setCurrentIndex(index || 0); }, [index, item?.id]);
  useEffect(() => {
    if (!current) return;
    setSelectedCategory(mediaCategory(current));
    const type = screenshotType(current);
    setSelectedScreenshotType(type.type);
    setScreenshotMeta(type);
    setTags(mediaUserTags(current));
    setTagInput('');
  }, [current?.id]);

  useEffect(() => {
    if (!current || list.length < 2) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); setCurrentIndex((value) => (value - 1 + list.length) % list.length); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setCurrentIndex((value) => (value + 1) % list.length); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [current?.id, list.length]);

  if (!current) return null;

  const titleId = `magic-viewer-title-${current.id}`;
  function move(step) { setCurrentIndex((value) => (value + step + list.length) % list.length); }

  async function download() {
    const res = await fetch(mediaSrc(current.id));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = current.name || 'memory';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function favorite() { await apiFetch(`/media/${current.id}/favorite`, { method: 'POST' }); toast.success('Favorite updated'); onChanged?.(); }
  async function trash() { await apiFetch(`/media/${current.id}/trash`, { method: 'POST' }); toast.success('Moved to trash'); onClose(); onChanged?.(); }
  async function saveOrganization(patch, successMessage) {
    setSaving(true);
    try {
      await apiFetch(`/media/${current.id}/organize`, { method: 'PATCH', body: JSON.stringify(patch) });
      toast.success(successMessage);
      await onChanged?.();
    } catch (error) {
      toast.error(error?.message || 'Could not update this memory');
      throw error;
    } finally { setSaving(false); }
  }
  async function changeCategory(nextCategory) {
    const previous = selectedCategory;
    setSelectedCategory(nextCategory);
    try { await saveOrganization({ category: nextCategory }, `Moved to ${CATEGORY_LABELS[nextCategory]}`); }
    catch { setSelectedCategory(previous); }
  }
  async function changeScreenshotType(nextType) {
    const previous = selectedScreenshotType;
    setSelectedScreenshotType(nextType);
    setScreenshotMeta({ type: nextType, source: 'user', confidence: 1, reason: 'Chosen by you' });
    try { await saveOrganization({ screenshotType: nextType }, `Saved as ${SCREENSHOT_TYPE_LABELS[nextType]}`); }
    catch { setSelectedScreenshotType(previous); }
  }
  async function addTag() {
    const value = tagInput.trim().toLowerCase();
    if (!value || tags.includes(value)) { setTagInput(''); return; }
    const previous = tags;
    const next = [...tags, value].slice(0, 30);
    setTags(next); setTagInput('');
    try { await saveOrganization({ tags: next }, `Added #${value}`); }
    catch { setTags(previous); }
  }
  async function removeTag(tag) {
    const previous = tags;
    const next = tags.filter((value) => value !== tag);
    setTags(next);
    try { await saveOrganization({ tags: next }, `Removed #${tag}`); }
    catch { setTags(previous); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex h-full flex-col outline-none">
        <button aria-label="Close memory viewer" onClick={onClose} className="absolute right-4 top-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><X className="h-6 w-6" /></button>
        {list.length > 1 && <><button aria-label="Previous memory" onClick={() => move(-1)} className="absolute left-3 top-1/2 z-20 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><ChevronLeft className="h-7 w-7" /></button><button aria-label="Next memory" onClick={() => move(1)} className="absolute right-3 top-1/2 z-20 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><ChevronRight className="h-7 w-7" /></button></>}

        <div className="grid flex-1 place-items-center p-4 pb-[19rem] pt-16 md:pb-[16rem]">
          {current.kind === 'photo' ? <img src={mediaSrc(current.id)} alt={current.name || 'Memory'} className="max-h-full max-w-full object-contain" /> : current.kind === 'video' ? <video src={mediaSrc(current.id)} className="max-h-full max-w-full" controls autoPlay aria-label={current.name || 'Memory video'} /> : <div className="max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/75">{current.aiAnalysis?.description || current.name}</div>}
        </div>

        <div className="absolute bottom-0 left-0 right-0 max-h-[46vh] overflow-y-auto border-t border-white/10 bg-[#0b0414]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><h2 id={titleId} className="truncate text-sm font-black text-white">{current.name}</h2><p className="text-xs text-white/45" aria-live="polite">Memory {currentIndex + 1} of {list.length}. Use arrow keys or buttons to navigate.</p></div></div>

          <div className="mb-3 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:grid-cols-2">
            {screenshot ? (
              <fieldset>
                <legend className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-white/45">Screenshot type</legend>
                {screenshotMeta?.source !== 'user' && <p className="mb-2 text-xs text-white/45">Suggested: <span className="font-bold text-white/80">{SCREENSHOT_TYPE_LABELS[screenshotMeta?.type || selectedScreenshotType]}</span> · {screenshotMeta?.reason}</p>}
                <div className="grid grid-cols-3 gap-2">{Object.entries(SCREENSHOT_TYPE_LABELS).map(([key, label]) => <button aria-pressed={selectedScreenshotType === key} key={key} onClick={() => changeScreenshotType(key)} disabled={saving} className={`min-h-11 rounded-xl border px-2 py-2.5 text-xs font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${selectedScreenshotType === key ? 'border-pink-400/50 bg-pink-500/15 text-pink-100' : 'border-white/10 bg-white/5 text-white/55'}`}>{label}</button>)}</div>
                <p className="mt-2 text-[11px] text-white/35">Visual for saved images · Info for references · Docs for important documents.</p>
              </fieldset>
            ) : (
              <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-white/45">Category</span><select value={selectedCategory} onChange={(event) => changeCategory(event.target.value)} disabled={saving} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#170d22] px-3 py-2.5 text-sm font-bold text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><option value="photos">Photos</option><option value="videos">Videos</option><option value="screenshots">Screenshots</option><option value="docs">Docs</option></select></label>
            )}

            <div>
              <label htmlFor={`tag-${current.id}`} className="mb-1.5 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-white/45"><Tag className="h-3.5 w-3.5" aria-hidden="true" /> Tags</label>
              <div className="flex gap-2"><input id={`tag-${current.id}`} value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } }} placeholder="family, vacation, receipt..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300" /><button aria-label="Add tag" onClick={addTag} disabled={saving || !tagInput.trim()} className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300"><Plus className="h-4 w-4" /></button></div>
              {!!tags.length && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Memory tags">{tags.map((tag) => <button aria-label={`Remove tag ${tag}`} key={tag} onClick={() => removeTag(tag)} disabled={saving} className="min-h-9 rounded-full border border-pink-400/20 bg-pink-500/10 px-2.5 py-1 text-[11px] font-bold text-pink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300">#{tag} ×</button>)}</div>}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2"><ViewerAction onClick={favorite} icon={Heart} label="Favorite" /><ViewerAction onClick={download} icon={Download} label="Download" /><ViewerAction onClick={() => toast('Ready-to-post action coming from this memory')} icon={Send} label="Social post" primary /><ViewerAction onClick={trash} icon={Trash2} label="Trash" danger /></div>
        </div>
      </div>
    </div>
  );
}

function ViewerAction({ onClick, icon: Icon, label, primary = false, danger = false }) {
  const style = danger ? 'border border-rose-400/20 bg-rose-400/10 text-rose-100' : primary ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'border border-white/10 bg-white/5 text-white';
  return <button onClick={onClick} className={`min-h-14 rounded-xl px-2 py-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${style}`}><Icon className="mx-auto mb-1 h-4 w-4" aria-hidden="true" />{label}</button>;
}
