'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, FileText, Film, Image as ImageIcon, Loader2, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import useMagicLibrary from '@/components/magic-library/useMagicLibrary';
import PeopleActivation from '@/components/magic-library/PeopleActivation';
import PeopleRow from '@/components/magic-library/PeopleRow';
import MediaSection from '@/components/magic-library/MediaSection';
import MediaViewer from '@/components/magic-library/MediaViewer';
import LockedPersonPrompt from '@/components/magic-library/LockedPersonPrompt';
import { buildLibrarySections, buildPersonSections, findConfirmedSelfLabel } from '@/lib/magic-library-sections';
import { isDocsItem, mediaCategory, screenshotType } from '@/lib/media-category';
import { mediaSrc } from '@/lib/api-client';

const NAME_KEY = 'snapnext.magicPersonNames.v1';
const TITLES = { photos: 'Photos', videos: 'Videos', screenshots: 'Screenshots', docs: 'Docs' };
const SHOT_FILTERS = [['all', 'All'], ['visual', 'Visual'], ['info', 'Info'], ['docs', 'Docs']];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanName(value) {
  const name = String(value || '').trim();
  const generic = !name || UUID_PATTERN.test(name) || /^person\s*\d+$/i.test(name) || ['person', 'people', 'unknown', 'face', 'user'].includes(name.toLowerCase());
  return generic ? 'Add name' : name;
}

export default function MagicLibraryGalleryMagic() {
  const magic = useMagicLibrary();
  const [viewer, setViewer] = useState(null);
  const [sectionKey, setSectionKey] = useState(null);
  const [category, setCategory] = useState(null);
  const [shotFilter, setShotFilter] = useState('all');
  const [lockedPerson, setLockedPerson] = useState(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [personNames, setPersonNames] = useState({});

  useEffect(() => { if (!magic.activePerson && magic.activation.enabled?.length) magic.setActivePerson(magic.activation.enabled[0]); }, [magic.activePerson, magic.activation.enabled]);
  useEffect(() => { setDraftQuery(magic.query || ''); }, [magic.query]);
  useEffect(() => { try { setPersonNames(JSON.parse(localStorage.getItem(NAME_KEY) || '{}')); } catch {} }, []);

  const displayName = (name) => cleanName(personNames[name] || name);
  const renamePerson = (name) => {
    const nextName = window.prompt('Name this face', displayName(name) === 'Add name' ? '' : displayName(name));
    if (!nextName?.trim()) return;
    const next = { ...personNames, [name]: nextName.trim() };
    setPersonNames(next);
    try { localStorage.setItem(NAME_KEY, JSON.stringify(next)); } catch {}
  };

  async function confirmPeople() {
    try { await magic.confirmActivation(); toast.success('Your active people are ready'); }
    catch (error) { toast.error(error.message || 'Could not activate people'); }
  }

  function runSearch(value = draftQuery) {
    setSectionKey(null); setCategory(null); magic.setQuery(String(value || '').trim());
  }

  function openCategory(next) {
    magic.setActivePerson(''); magic.setQuery(''); setDraftQuery(''); setSectionKey(null); setCategory(next);
    if (next === 'screenshots') setShotFilter('all');
  }

  function showAll() {
    magic.setActivePerson(''); magic.setQuery(''); setDraftQuery(''); setSectionKey(null); setCategory(null); setShotFilter('all');
  }

  const selfLabel = useMemo(() => findConfirmedSelfLabel(magic.people), [magic.people]);
  const sections = useMemo(() => {
    if (magic.activePerson) return buildPersonSections({ items: magic.visibleItems, personName: magic.activePerson, displayName });
    return buildLibrarySections({ items: magic.query ? magic.visibleItems : magic.items, selfLabel, displayName });
  }, [magic.activePerson, magic.visibleItems, magic.query, magic.items, selfLabel, personNames]);

  const categoryView = useMemo(() => {
    if (!category) return null;
    let items;
    if (category === 'screenshots') {
      items = magic.items.filter((item) => mediaCategory(item) === 'screenshots');
      if (shotFilter !== 'all') items = items.filter((item) => screenshotType(item).type === shotFilter);
    } else if (category === 'docs') items = magic.items.filter((item) => isDocsItem(item));
    else items = magic.items.filter((item) => mediaCategory(item) === category);
    return { key: `category-${category}`, title: TITLES[category], items };
  }, [category, shotFilter, magic.items]);

  const expanded = categoryView || sections.find((section) => section.key === sectionKey);
  const activePersonLabel = magic.activePerson ? displayName(magic.activePerson) : '';
  const searchPlaceholder = activePersonLabel && activePersonLabel !== 'Add name' ? `Search memories with ${activePersonLabel}` : 'Search your memories';
  const suggestions = useMemo(() => {
    const typed = draftQuery.trim().toLowerCase();
    if (!typed) return [];
    const values = new Set(magic.suggestions.filter((value) => !UUID_PATTERN.test(String(value || '').trim())));
    magic.people.forEach((person) => {
      const label = displayName(person.name);
      if (label !== 'Add name') values.add(label);
    });
    return Array.from(values).filter((value) => value.toLowerCase().includes(typed)).slice(0, 6);
  }, [draftQuery, magic.people, magic.suggestions, personNames]);

  if (magic.busy) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-pink-300" /></div>;
  if (magic.people.length > 0 && magic.activation.active.length === 0) return <PeopleActivation people={magic.people} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirmPeople} busy={magic.activating} />;

  return <div className="space-y-5">
    <header>
      <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-full bg-pink-500/15 text-pink-200"><Sparkles className="h-4 w-4" /></span><div><h1 className="text-2xl font-black text-white md:text-3xl">Magic Library</h1><p className="text-xs text-white/40">Your organized memories</p></div></div>
      <div className="mt-3 flex max-w-3xl gap-2"><div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runSearch()} placeholder={searchPlaceholder} className="w-full rounded-full border border-white/10 bg-white/[0.05] py-2.5 pl-10 pr-10 text-sm text-white outline-none focus:border-pink-400/40" />{draftQuery && <button onClick={() => { setDraftQuery(''); magic.setQuery(''); }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35"><X className="h-4 w-4" /></button>}</div><button onClick={() => runSearch()} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-sm font-bold text-white">Search</button></div>
      {!!suggestions.length && <div className="mt-2 flex flex-wrap gap-1.5">{suggestions.map((label) => <button key={label} onClick={() => { setDraftQuery(label); runSearch(label); }} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">{label}</button>)}</div>}
    </header>

    {!!magic.people.length && <PeopleRow people={magic.people} enabledNames={magic.activation.enabled || []} favoriteNames={magic.favoriteNames} activePerson={magic.activePerson} displayName={displayName} onRename={renamePerson} onOpen={(name) => { setSectionKey(null); setCategory(null); magic.setActivePerson(name); }} onLocked={setLockedPerson} />}

    {!magic.activePerson && <div className="grid grid-cols-4 gap-1.5"><CategoryButton icon={Camera} label="Photos" onClick={() => openCategory('photos')} className="text-pink-300" /><CategoryButton icon={Film} label="Videos" onClick={() => openCategory('videos')} className="text-purple-300" /><CategoryButton icon={ImageIcon} label="Screenshots" onClick={() => openCategory('screenshots')} className="text-sky-300" /><CategoryButton icon={FileText} label="Docs" onClick={() => openCategory('docs')} className="text-emerald-300" /></div>}

    {category === 'screenshots' && <div className="flex gap-2 overflow-x-auto pb-1">{SHOT_FILTERS.map(([key, label]) => <button key={key} onClick={() => setShotFilter(key)} className={`rounded-full border px-3 py-1.5 text-xs font-black ${shotFilter === key ? 'border-sky-300/50 bg-sky-400/15 text-sky-100' : 'border-white/10 bg-white/5 text-white/50'}`}>{label}</button>)}</div>}

    {(magic.activePerson || magic.query || sectionKey || category) && <button onClick={showAll} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-white/65">Show all memories</button>}

    {expanded ? <div><div className="mb-3"><h2 className="text-xl font-black text-white">{expanded.title}</h2><p className="text-xs text-white/40">{expanded.items.length} memories</p></div><div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6">{expanded.items.map((item, index) => <button key={item.id} onClick={() => setViewer({ item, items: expanded.items, index })} className="aspect-square overflow-hidden rounded-xl bg-white/5">{item.kind === 'photo' ? <img src={mediaSrc(item.id)} className="h-full w-full object-cover" alt="" /> : item.kind === 'video' ? <video src={mediaSrc(item.id)} className="h-full w-full object-cover" muted playsInline preload="metadata" /> : <div className="grid h-full w-full place-items-center p-2 text-xs text-white/60">{item.name}</div>}</button>)}</div></div> : sections.map((section) => <MediaSection key={section.key} title={section.title} items={section.items} onOpen={(item, index) => setViewer({ item, items: section.items, index })} onExpand={() => { setCategory(null); setSectionKey(section.key); }} emptyCopy="No matching memories yet." />)}

    <MediaViewer item={viewer?.item} items={viewer?.items || []} index={viewer?.index || 0} onClose={() => setViewer(null)} onChanged={magic.reload} />
    <LockedPersonPrompt person={lockedPerson} onClose={() => setLockedPerson(null)} />
  </div>;
}

function CategoryButton({ icon: Icon, label, onClick, className }) {
  return <button onClick={onClick} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] px-1 text-[10px] font-bold text-white/75 transition hover:bg-white/[0.08]"><Icon className={`h-4 w-4 ${className}`} />{label}</button>;
}
