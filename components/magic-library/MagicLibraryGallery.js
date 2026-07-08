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

const NAME_KEY = 'snapnext.magicPersonNames.v1';
function cleanName(v){ const s=String(v||'').trim(); return !s || /^person\s*\d+$/i.test(s) || ['person','people','unknown','face','user'].includes(s.toLowerCase()) ? 'Add name' : s; }

export default function MagicLibraryGallery() {
  const magic = useMagicLibrary();
  const [viewer, setViewer] = useState(null);
  const [lockedPerson, setLockedPerson] = useState(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [personNames, setPersonNames] = useState({});

  useEffect(() => { if (!magic.activePerson && magic.activation.enabled?.length) magic.setActivePerson(magic.activation.enabled[0]); }, [magic.activePerson, magic.activation.enabled]);
  useEffect(() => { setDraftQuery(magic.query || ''); }, [magic.query]);
  useEffect(() => { try { setPersonNames(JSON.parse(localStorage.getItem(NAME_KEY) || '{}')); } catch {} }, []);

  const displayName = (name) => personNames[name] || cleanName(name);
  function renamePerson(name){ const nextName = window.prompt('Name this face', displayName(name) === 'Add name' ? '' : displayName(name)); if (!nextName?.trim()) return; const next = { ...personNames, [name]: nextName.trim() }; setPersonNames(next); try { localStorage.setItem(NAME_KEY, JSON.stringify(next)); } catch {} }
  async function confirm() { try { await magic.confirmActivation(); toast.success('Your Magic Library people are active'); } catch (error) { toast.error(error.message || 'Could not activate people'); } }

  const smartSuggestions = useMemo(() => {
    const values = new Set(['family','celebration','recent photos','recent videos','screenshots','docs', ...magic.suggestions]);
    for (const person of magic.people) values.add(displayName(person.name));
    const typed = draftQuery.trim().toLowerCase();
    return Array.from(values).filter((v) => !typed || v.toLowerCase().includes(typed)).slice(0, 8);
  }, [draftQuery, magic.people, magic.suggestions, personNames]);
  const runSearch = (value = draftQuery) => magic.setQuery(String(value || '').trim());
  function quickFilter(type){ magic.setActivePerson(''); const map = { photos: 'photo', videos: 'video', screenshots: 'screenshot', docs: 'doc' }; magic.setQuery(map[type] || ''); }

  if (magic.busy) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-pink-300" /></div>;
  if (magic.people.length > 0 && magic.activation.active.length === 0) return <PeopleActivation people={magic.people} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} busy={magic.activating} />;

  const canAddMore = magic.activation.active.length < magic.activation.limit && magic.people.some((person) => !magic.activation.active.includes(person.name));
  const title = magic.activePerson ? displayName(magic.activePerson) : magic.query ? `Results for “${magic.query}”` : 'Magic Library';

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-pink-500/15 text-pink-200"><Sparkles className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-[0.22em] text-pink-100/60">Your protected memories</p><h1 className="text-3xl font-black text-white md:text-4xl">Magic Library</h1></div></div>
        <div className="mt-5 flex max-w-3xl gap-2"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input value={draftQuery} onChange={(e) => setDraftQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} placeholder="Search memories" className="w-full rounded-full border border-white/10 bg-white/[0.05] py-3 pl-11 pr-11 text-sm text-white outline-none focus:border-pink-400/40" />{draftQuery && <button onClick={() => { setDraftQuery(''); magic.setQuery(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35"><X className="h-4 w-4" /></button>}</div><button onClick={() => runSearch()} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-sm font-bold text-white">Search</button></div>
        {!!smartSuggestions.length && <div className="mt-3 flex flex-wrap gap-2">{smartSuggestions.map((label) => <button key={label} onClick={() => { setDraftQuery(label); runSearch(label); }} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55">{label}</button>)}</div>}
      </header>

      {magic.people.length > 0 && <PeopleRow people={magic.people} enabledNames={magic.activation.enabled || []} favoriteNames={magic.favoriteNames} activePerson={magic.activePerson} displayName={displayName} onRename={renamePerson} onOpen={magic.setActivePerson} onLocked={setLockedPerson} />}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><button onClick={() => quickFilter('photos')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><Camera className="mb-2 h-4 w-4 text-pink-300" />All recent photos</button><button onClick={() => quickFilter('videos')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><Film className="mb-2 h-4 w-4 text-purple-300" />All recent videos</button><button onClick={() => quickFilter('screenshots')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><ImageIcon className="mb-2 h-4 w-4 text-sky-300" />Screenshots</button><button onClick={() => quickFilter('docs')} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left text-sm font-bold text-white/75"><FileText className="mb-2 h-4 w-4 text-emerald-300" />Docs</button></div>
      {magic.activePerson && <button onClick={() => magic.setActivePerson('')} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white/65">Show all memories</button>}
      {canAddMore && <PeopleActivation people={magic.people} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} busy={magic.activating} />}

      <div><h2 className="text-2xl font-black text-white">{title}</h2><p className="mt-1 text-sm text-white/45">{magic.visibleItems.length} matching protected memories</p></div>
      <MediaSection title={magic.activePerson ? `Best of ${displayName(magic.activePerson)} ✨` : 'Best Matches ✨'} items={magic.bestItems} onOpen={setViewer} />
      <MediaSection title={magic.activePerson ? `Videos with ${displayName(magic.activePerson)}` : 'Videos'} items={magic.videos} onOpen={setViewer} />
      <MediaSection title="All Photos" items={magic.photos} onOpen={setViewer} emptyCopy="No matching photos yet." />
      <MediaViewer item={viewer} onClose={() => setViewer(null)} onChanged={magic.reload} />
      <LockedPersonPrompt person={lockedPerson} onClose={() => setLockedPerson(null)} />
    </div>
  );
}
