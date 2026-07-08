'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Camera, FileText, Film, Image as ImageIcon, Loader2, Search, Sparkles, X } from 'lucide-react';
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
const SKIP_KEY = 'snapnext.magicActivationSkipped.v1';
const CATEGORY_TITLES = { photos: 'Photos', videos: 'Videos', screenshots: 'Screenshots', docs: 'Docs' };

function cleanName(value) {
  const name = String(value || '').trim();
  return !name || /^person\s*\d+$/i.test(name) || ['person', 'people', 'unknown', 'face', 'user'].includes(name.toLowerCase()) ? 'Add name' : name;
}

export default function MagicLibraryGallery() {
  const searchParams = useSearchParams();
  const magic = useMagicLibrary();
  const [viewer, setViewer] = useState(null);
  const [openSection, setOpenSection] = useState(null);
  const [openCategoryKey, setOpenCategoryKey] = useState(null);
  const [lockedPerson, setLockedPerson] = useState(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [personNames, setPersonNames] = useState({});
  const [activationSkipped, setActivationSkipped] = useState(false);
  const forceActivation = searchParams.get('activate') === '1';

  useEffect(() => { setDraftQuery(magic.query || ''); }, [magic.query]);
  useEffect(() => {
    try {
      setPersonNames(JSON.parse(localStorage.getItem(NAME_KEY) || '{}'));
      setActivationSkipped(localStorage.getItem(SKIP_KEY) === '1');
    } catch {}
  }, []);

  const displayName = (name) => personNames[name] || cleanName(name);

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
      setActivationSkipped(false);
      try { localStorage.removeItem(SKIP_KEY); } catch {}
      toast.success('Your Magic Library people are active');
    } catch (error) {
      toast.error(error.message || 'Could not activate people');
    }
  }

  function skipActivation() {
    setActivationSkipped(true);
    try { localStorage.setItem(SKIP_KEY, '1'); } catch {}
    toast('No problem — activate People Search later from Favorites.');
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
    return {
      key: `category-${openCategoryKey}`,
      title: CATEGORY_TITLES[openCategoryKey],
      items: magic.items.filter((item) => mediaCategory(item) === openCategoryKey),
    };
  }, [openCategoryKey, magic.items]);

  const expanded = categoryExpanded || sections.find((section) => section.key === openSection);
  const title = magic.activePerson ? displayName(magic.activePerson) : magic.query ? `Results for “${magic.query}”` : 'Magic Library';
  const resultCount = sections.reduce((total, section) => total + section.items.length, 0);

  function openViewer(section, item, index) { setViewer({ item, items: section.items, index }); }

  if (magic.busy) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-pink-300" /></div>;

  if (magic.people.length > 0 && magic.activation.active.length === 0 && (!activationSkipped || forceActivation)) {
    return <PeopleActivation people={magic.people} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} onSkip={skipActivation} busy={magic.activating} />;
  }

  const canAddMore = magic.activation.active.length > 0 && magic.activation.active.length < magic.activation.limit && magic.people.some((person) => !magic.activation.active.includes(person.name));

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-pink-500/15 text-pink-200"><Sparkles className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-[0.22em] text-pink-100/60">Your protected memories</p><h1 className="text-3xl font-black text-white md:text-4xl">Magic Library</h1></div></div>
        <div className="mt-5 flex max-w-3xl gap-2"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runSearch()} placeholder={magic.activePerson ? `Search memories with ${displayName(magic.activePerson)}...` : 'Search memories'} className="w-full rounded-full border border-white/10 bg-white/[0.05] py-3 pl-11 pr-11 text-sm text-white outline-none focus:border-pink-400/40" />{draftQuery && <button onClick={() => { setDraftQuery(''); magic.setQuery(''); setOpenSection(null); setOpenCategoryKey(null); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35"><X className="h-4 w-4" /></button>}</div><button onClick={() => runSearch()} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-sm font-bold text-white">Search</button></div>
        {!!smartSuggestions.length && <div className="mt-3 flex flex-wrap gap-2">{smartSuggestions.map((label) => <button key={label} onClick={() => { setDraftQuery(label); runSearch(label); }} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55">{label}</button>)}</div>}
      </header>

      {activationSkipped && magic.activation.active.length === 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pink-400/15 bg-pink-500/[0.06] p-4"><div><div className="text-sm font-black text-white">People Search is waiting</div><p className="mt-1 text-xs text-white/45">Activate up to {magic.activation.limit} people whenever you are ready.</p></div><a href="/magic-library?activate=1" className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white">Activate People</a></div>}

      {magic.people.length > 0 && <PeopleRow people={magic.people} enabledNames={magic.activation.enabled || []} favoriteNames={magic.favoriteNames} activePerson={magic.activePerson} displayName={displayName} onRename={renamePerson} onOpen={(name) => { setOpenSection(null); setOpenCategoryKey(null); magic.setActivePerson(name); }} onLocked={setLockedPerson} />}

      {!magic.activePerson && <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><button onClick={() => openCategory('photos')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><Camera className="mb-2 h-4 w-4 text-pink-300" />Photos</button><button onClick={() => openCategory('videos')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><Film className="mb-2 h-4 w-4 text-purple-300" />Videos</button><button onClick={() => openCategory('screenshots')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><ImageIcon className="mb-2 h-4 w-4 text-sky-300" />Screenshots</button><button onClick={() => openCategory('docs')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><FileText className="mb-2 h-4 w-4 text-emerald-300" />Docs</button></div>}

      {(magic.activePerson || magic.query || openSection || openCategoryKey) && <button onClick={showAll} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white/65">Show all memories</button>}
      {canAddMore && <PeopleActivation people={magic.people} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} busy={magic.activating} />}

      <div><h2 className="text-2xl font-black text-white">{expanded ? expanded.title : title}</h2><p className="mt-1 text-sm text-white/45">{expanded ? expanded.items.length : resultCount} matching protected memories</p></div>

      {expanded ? <div><button onClick={() => { setOpenSection(null); setOpenCategoryKey(null); }} className="mb-4 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white/65">Back to sections</button><div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6">{expanded.items.map((item, index) => <button key={item.id} onClick={() => openViewer(expanded, item, index)} className="aspect-square overflow-hidden rounded-xl bg-white/5">{item.kind === 'photo' ? <img src={`/api/media/${item.id}`} className="h-full w-full object-cover" alt="" /> : item.kind === 'video' ? <video src={`/api/media/${item.id}`} className="h-full w-full object-cover" muted /> : <div className="grid h-full w-full place-items-center p-2 text-xs text-white/60">{item.name}</div>}</button>)}</div></div> : sections.map((section) => <MediaSection key={section.key} title={section.title} items={section.items} onOpen={(item, index) => openViewer(section, item, index)} onExpand={() => { setOpenCategoryKey(null); setOpenSection(section.key); }} emptyCopy="No matching memories yet." />)}

      <MediaViewer item={viewer?.item} items={viewer?.items || []} index={viewer?.index || 0} onClose={() => setViewer(null)} onChanged={magic.reload} />
      <LockedPersonPrompt person={lockedPerson} onClose={() => setLockedPerson(null)} />
    </div>
  );
}
