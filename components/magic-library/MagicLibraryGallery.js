'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, FileText, Film, Image as ImageIcon, Loader2, Search, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import useMagicLibrary from '@/components/magic-library/useMagicLibrary';
import PeopleActivation from '@/components/magic-library/PeopleActivation';
import PeopleRow from '@/components/magic-library/PeopleRow';
import MediaSection from '@/components/magic-library/MediaSection';
import MediaViewer from '@/components/magic-library/MediaViewer';
import LockedPersonPrompt from '@/components/magic-library/LockedPersonPrompt';
import { buildLibrarySections, buildPersonSections, findConfirmedSelfLabel } from '@/lib/magic-library-sections';
import { mediaCategory } from '@/lib/media-category';

const NAME_KEY = 'snapnext.magicPersonNames.v1';
const CATEGORY_TITLES = { photos: 'Photos', videos: 'Videos', screenshots: 'Screenshots', docs: 'Docs' };
const GRID_CLASSES = {
  small: 'grid-cols-4 md:grid-cols-7 lg:grid-cols-9',
  medium: 'grid-cols-3 md:grid-cols-5 lg:grid-cols-6',
  large: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5',
};

function cleanName(value) {
  const name = String(value || '').trim();
  return !name || /^person\s*\d+$/i.test(name) || ['person', 'people', 'unknown', 'face', 'user'].includes(name.toLowerCase()) ? 'Add name' : name;
}

export default function MagicLibraryGallery() {
  const magic = useMagicLibrary();
  const [viewer, setViewer] = useState(null);
  const [openSection, setOpenSection] = useState(null);
  const [openCategoryKey, setOpenCategoryKey] = useState(null);
  const [lockedPerson, setLockedPerson] = useState(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [personNames, setPersonNames] = useState({});
  const [gridSize, setGridSize] = useState('medium');

  useEffect(() => { if (!magic.activePerson && magic.activation.enabled?.length) magic.setActivePerson(magic.activation.enabled[0]); }, [magic.activePerson, magic.activation.enabled]);
  useEffect(() => { setDraftQuery(magic.query || ''); }, [magic.query]);
  useEffect(() => { try { setPersonNames(JSON.parse(localStorage.getItem(NAME_KEY) || '{}')); } catch {} }, []);

  const displayName = (name) => personNames[name] || cleanName(name);
  const eligiblePeople = useMemo(() => magic.people.filter((person) => person.thumbnailEligible !== false || person.isSelf || magic.activation.enabled?.includes?.(person.name)), [magic.people, magic.activation.enabled]);

  function renamePerson(name) {
    const nextName = window.prompt('Name this face', displayName(name) === 'Add name' ? '' : displayName(name));
    if (!nextName?.trim()) return;
    const next = { ...personNames, [name]: nextName.trim() };
    setPersonNames(next);
    try { localStorage.setItem(NAME_KEY, JSON.stringify(next)); } catch {}
  }

  async function confirm() {
    try {
      await magic.confirmActivation();
      toast.success('Your Magic Library people are active');
    } catch (error) {
      toast.error(error.message || 'Could not activate people');
    }
  }

  const smartSuggestions = useMemo(() => {
    const typed = draftQuery.trim().toLowerCase();
    if (!typed) return [];
    const values = new Set([...magic.suggestions]);
    for (const person of magic.people) values.add(displayName(person.name));
    return Array.from(values).filter((value) => value.toLowerCase().includes(typed)).slice(0, 6);
  }, [draftQuery, magic.people, magic.suggestions, personNames]);

  const runSearch = (value = draftQuery) => {
    setOpenSection(null);
    setOpenCategoryKey(null);
    magic.setQuery(String(value || '').trim());
  };

  function openCategory(category) {
    magic.setActivePerson('');
    magic.setQuery('');
    setDraftQuery('');
    setOpenSection(null);
    setOpenCategoryKey(category);
  }

  function showAll() {
    magic.setActivePerson('');
    magic.setQuery('');
    setDraftQuery('');
    setOpenSection(null);
    setOpenCategoryKey(null);
  }

  const selfLabel = useMemo(() => findConfirmedSelfLabel(magic.people), [magic.people]);
  const sections = useMemo(() => {
    if (magic.activePerson) return buildPersonSections({ items: magic.visibleItems, personName: magic.activePerson, displayName });
    const source = magic.query ? magic.visibleItems : magic.items;
    return buildLibrarySections({ items: source, selfLabel, displayName });
  }, [magic.activePerson, magic.visibleItems, magic.query, magic.items, selfLabel, personNames]);

  const categoryExpanded = useMemo(() => {
    if (!openCategoryKey) return null;
    return { key: `category-${openCategoryKey}`, title: CATEGORY_TITLES[openCategoryKey], items: magic.items.filter((item) => mediaCategory(item) === openCategoryKey) };
  }, [openCategoryKey, magic.items]);

  const expanded = categoryExpanded || sections.find((section) => section.key === openSection);
  const title = magic.activePerson ? displayName(magic.activePerson) : magic.query ? `Results for “${magic.query}”` : 'Magic Library';
  const resultCount = magic.activePerson ? magic.visibleTotal : magic.query ? magic.visibleItems.length : magic.items.length;
  const showContextHeading = Boolean(expanded || magic.activePerson || magic.query);

  function openViewer(section, item, index) { setViewer({ item, items: section.items, index }); }

  if (magic.busy) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-pink-300" /></div>;
  if (eligiblePeople.length > 0 && magic.activation.active.length === 0) return <PeopleActivation people={eligiblePeople} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} busy={magic.activating} />;

  const canAddMore = magic.activation.active.length < magic.activation.limit && eligiblePeople.some((person) => !magic.activation.active.includes(person.name));

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-full bg-pink-500/15 text-pink-200"><Sparkles className="h-4.5 w-4.5" /></span><div><h1 className="text-2xl font-black text-white md:text-3xl">Magic Library</h1><p className="text-xs text-white/40">Your organized memories</p></div></div>
        <div className="mt-3 flex max-w-3xl gap-2"><div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runSearch()} placeholder={magic.activePerson ? `Search with ${displayName(magic.activePerson)}...` : 'Search memories'} className="w-full rounded-full border border-white/10 bg-white/[0.05] py-2.5 pl-10 pr-10 text-sm text-white outline-none focus:border-pink-400/40" />{draftQuery && <button onClick={() => { setDraftQuery(''); magic.setQuery(''); setOpenSection(null); setOpenCategoryKey(null); }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35"><X className="h-4 w-4" /></button>}</div><button onClick={() => runSearch()} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-sm font-bold text-white">Search</button></div>
        {!!smartSuggestions.length && <div className="mt-2 flex flex-wrap gap-1.5">{smartSuggestions.map((label) => <button key={label} onClick={() => { setDraftQuery(label); runSearch(label); }} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">{label}</button>)}</div>}
      </header>

      {magic.people.length > 0 && <PeopleRow people={magic.people} enabledNames={magic.activation.enabled || []} activeCount={magic.activation.active.length} favoriteNames={magic.favoriteNames} activePerson={magic.activePerson} displayName={displayName} onRename={renamePerson} onOpen={(name) => { setOpenSection(null); setOpenCategoryKey(null); magic.setActivePerson(name); }} onLocked={setLockedPerson} />}
      {!magic.activePerson && <div className="grid grid-cols-4 gap-1.5"><CategoryButton icon={Camera} label="Photos" onClick={() => openCategory('photos')} className="text-pink-300" /><CategoryButton icon={Film} label="Videos" onClick={() => openCategory('videos')} className="text-purple-300" /><CategoryButton icon={ImageIcon} label="Screenshots" onClick={() => openCategory('screenshots')} className="text-sky-300" /><CategoryButton icon={FileText} label="Docs" onClick={() => openCategory('docs')} className="text-emerald-300" /></div>}
      {(magic.activePerson || magic.query || openSection || openCategoryKey) && <button onClick={showAll} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-white/65">Show all memories</button>}
      {canAddMore && <PeopleActivation people={eligiblePeople} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} busy={magic.activating} />}
      {showContextHeading && <div><h2 className="text-xl font-black text-white">{expanded ? expanded.title : title}</h2><p className="mt-0.5 text-xs text-white/40">{magic.activePerson && magic.personBusy ? 'Counting matched memories…' : `${expanded ? expanded.items.length : resultCount} memories`}</p></div>}

      {magic.activePerson && magic.personBusy ? (
        <div className="flex min-h-40 items-center justify-center gap-2 rounded-3xl border border-white/10 bg-white/[0.035] text-sm font-bold text-white/55"><Loader2 className="h-4 w-4 animate-spin text-pink-300" />Loading all matched memories…</div>
      ) : expanded ? (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3"><button onClick={() => { setOpenSection(null); setOpenCategoryKey(null); }} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-white/65">Back to sections</button><div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] p-1"><button onClick={() => setGridSize('small')} className={`grid h-9 w-9 place-items-center rounded-full ${gridSize === 'small' ? 'bg-white text-black' : 'text-white/60'}`} aria-label="Smaller thumbnails"><ZoomOut className="h-4 w-4" /></button><button onClick={() => setGridSize('medium')} className={`h-9 rounded-full px-3 text-[11px] font-black ${gridSize === 'medium' ? 'bg-white text-black' : 'text-white/60'}`}>Fit</button><button onClick={() => setGridSize('large')} className={`grid h-9 w-9 place-items-center rounded-full ${gridSize === 'large' ? 'bg-white text-black' : 'text-white/60'}`} aria-label="Larger thumbnails"><ZoomIn className="h-4 w-4" /></button></div></div>
          <div className={`grid gap-2 ${GRID_CLASSES[gridSize]}`}>{expanded.items.map((item, index) => <button key={item.id} onClick={() => openViewer(expanded, item, index)} className="aspect-square overflow-hidden rounded-xl bg-white/5">{item.kind === 'photo' ? <img src={`/api/media/${item.id}`} className="h-full w-full object-cover" alt="" /> : item.kind === 'video' ? <video src={`/api/media/${item.id}`} className="h-full w-full object-cover" muted /> : <div className="grid h-full w-full place-items-center p-2 text-xs text-white/60">{item.name}</div>}</button>)}</div>
        </div>
      ) : sections.map((section) => <MediaSection key={section.key} title={section.title} items={section.items} onOpen={(item, index) => openViewer(section, item, index)} onExpand={() => { setOpenCategoryKey(null); setOpenSection(section.key); }} emptyCopy="No matching memories yet." />)}

      <MediaViewer item={viewer?.item} items={viewer?.items || []} index={viewer?.index || 0} onClose={() => setViewer(null)} onChanged={magic.reload} />
      <LockedPersonPrompt person={lockedPerson} onClose={() => setLockedPerson(null)} />
    </div>
  );
}

function CategoryButton({ icon: Icon, label, onClick, className }) {
  return <button onClick={onClick} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] px-1 text-[10px] font-bold text-white/75 transition hover:bg-white/[0.08]"><Icon className={`h-4 w-4 ${className}`} />{label}</button>;
}
