'use client';

import { ChevronLeft, ChevronRight, Download, Heart, Plus, Send, Tag, Trash2, X } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { mediaCategory, mediaUserTags } from '@/lib/media-category';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';

const CATEGORY_LABELS = {
  photos: 'Photos',
  videos: 'Videos',
  screenshots: 'Screenshots',
  docs: 'Docs',
};

export default function MediaViewer({ item, items = [], index = 0, onClose, onChanged }) {
  const [currentIndex, setCurrentIndex] = useState(index || 0);
  const [selectedCategory, setSelectedCategory] = useState('photos');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const list = useMemo(() => items.length ? items : item ? [item] : [], [items, item]);
  const current = list[currentIndex] || item;

  useEffect(() => { setCurrentIndex(index || 0); }, [index, item?.id]);
  useEffect(() => {
    if (!current) return;
    setSelectedCategory(mediaCategory(current));
    setTags(mediaUserTags(current));
    setTagInput('');
  }, [current?.id]);

  if (!current) return null;

  function move(step) {
    setCurrentIndex((value) => (value + step + list.length) % list.length);
  }

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

  async function favorite() {
    await apiFetch(`/media/${current.id}/favorite`, { method: 'POST' });
    toast.success('Favorite updated');
    onChanged?.();
  }

  async function trash() {
    await apiFetch(`/media/${current.id}/trash`, { method: 'POST' });
    toast.success('Moved to trash');
    onClose();
    onChanged?.();
  }

  async function saveOrganization(patch, successMessage) {
    setSaving(true);
    try {
      await apiFetch(`/media/${current.id}/organize`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toast.success(successMessage);
      await onChanged?.();
    } catch (error) {
      toast.error(error?.message || 'Could not update this memory');
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function changeCategory(nextCategory) {
    const previous = selectedCategory;
    setSelectedCategory(nextCategory);
    try {
      await saveOrganization({ category: nextCategory }, `Moved to ${CATEGORY_LABELS[nextCategory]}`);
    } catch {
      setSelectedCategory(previous);
    }
  }

  async function addTag() {
    const value = tagInput.trim().toLowerCase();
    if (!value || tags.includes(value)) {
      setTagInput('');
      return;
    }
    const previous = tags;
    const next = [...tags, value].slice(0, 30);
    setTags(next);
    setTagInput('');
    try {
      await saveOrganization({ tags: next }, `Added #${value}`);
    } catch {
      setTags(previous);
    }
  }

  async function removeTag(tag) {
    const previous = tags;
    const next = tags.filter((value) => value !== tag);
    setTags(next);
    try {
      await saveOrganization({ tags: next }, `Removed #${tag}`);
    } catch {
      setTags(previous);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 z-30 rounded-full bg-white/15 p-3 text-white"><X className="h-6 w-6" /></button>
      {list.length > 1 && <><button onClick={(event) => { event.stopPropagation(); move(-1); }} className="absolute left-3 top-1/2 z-20 rounded-full bg-white/15 p-3 text-white"><ChevronLeft className="h-7 w-7" /></button><button onClick={(event) => { event.stopPropagation(); move(1); }} className="absolute right-3 top-1/2 z-20 rounded-full bg-white/15 p-3 text-white"><ChevronRight className="h-7 w-7" /></button></>}

      <div className="flex h-full flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="grid flex-1 place-items-center p-4 pb-[19rem] pt-16 md:pb-[16rem]">
          {current.kind === 'photo' ? <img src={mediaSrc(current.id)} alt="" className="max-h-full max-w-full object-contain" /> : current.kind === 'video' ? <video src={mediaSrc(current.id)} className="max-h-full max-w-full" controls autoPlay /> : <div className="max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/75">{current.aiAnalysis?.description || current.name}</div>}
        </div>

        <div className="absolute bottom-0 left-0 right-0 max-h-[44vh] overflow-y-auto border-t border-white/10 bg-[#0b0414]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-black text-white">{current.name}</h2><p className="text-xs text-white/45">Swipe or tap arrows · {currentIndex + 1} of {list.length}</p></div></div>

          <div className="mb-3 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-white/45">Category</span>
              <select value={selectedCategory} onChange={(event) => changeCategory(event.target.value)} disabled={saving} className="w-full rounded-xl border border-white/10 bg-[#170d22] px-3 py-2.5 text-sm font-bold text-white outline-none">
                <option value="photos">Photos</option>
                <option value="videos">Videos</option>
                <option value="screenshots">Screenshots</option>
                <option value="docs">Docs</option>
              </select>
              {selectedCategory === 'screenshots' && <p className="mt-1.5 text-[11px] text-white/40">Choose Docs here when a screenshot should be filed as a document.</p>}
            </label>

            <div>
              <span className="mb-1.5 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-white/45"><Tag className="h-3.5 w-3.5" /> Tags</span>
              <div className="flex gap-2"><input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } }} placeholder="family, vacation, receipt..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-pink-400/40" /><button onClick={addTag} disabled={saving || !tagInput.trim()} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white disabled:opacity-35"><Plus className="h-4 w-4" /></button></div>
              {!!tags.length && <div className="mt-2 flex flex-wrap gap-1.5">{tags.map((tag) => <button key={tag} onClick={() => removeTag(tag)} disabled={saving} className="rounded-full border border-pink-400/20 bg-pink-500/10 px-2.5 py-1 text-[11px] font-bold text-pink-100">#{tag} ×</button>)}</div>}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2"><button onClick={favorite} className="rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-xs font-bold text-white"><Heart className="mx-auto mb-1 h-4 w-4" />Favorite</button><button onClick={download} className="rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-xs font-bold text-white"><Download className="mx-auto mb-1 h-4 w-4" />Download</button><button onClick={() => toast('Ready-to-post action coming from this memory')} className="rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-2 py-3 text-xs font-bold text-white"><Send className="mx-auto mb-1 h-4 w-4" />Social post</button><button onClick={trash} className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-2 py-3 text-xs font-bold text-rose-100"><Trash2 className="mx-auto mb-1 h-4 w-4" />Trash</button></div>
        </div>
      </div>
    </div>
  );
}
