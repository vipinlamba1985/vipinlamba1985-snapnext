'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import useMagicLibrary from '@/components/magic-library/useMagicLibrary';
import PeopleActivation from '@/components/magic-library/PeopleActivation';
import PeopleRow from '@/components/magic-library/PeopleRow';
import MediaSection from '@/components/magic-library/MediaSection';
import MediaViewer from '@/components/magic-library/MediaViewer';
import LockedPersonPrompt from '@/components/magic-library/LockedPersonPrompt';

export default function MagicLibraryGallery() {
  const magic = useMagicLibrary();
  const [viewer, setViewer] = useState(null);
  const [lockedPerson, setLockedPerson] = useState(null);
  const [activationSkipped, setActivationSkipped] = useState(false);

  useEffect(() => {
    if (!magic.activePerson && magic.activation.enabled?.length) magic.setActivePerson(magic.activation.enabled[0]);
  }, [magic.activePerson, magic.activation.enabled]);

  async function confirm() {
    try {
      await magic.confirmActivation();
      toast.success('Your Magic Library people are active');
    } catch (error) {
      toast.error(error.message || 'Could not activate people');
    }
  }

  function skipActivation() {
    setActivationSkipped(true);
    toast('You can activate People Search later from Favorites.');
  }

  if (magic.busy) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-pink-300" /></div>;

  if (magic.people.length > 0 && magic.activation.active.length === 0 && !activationSkipped) {
    return <PeopleActivation people={magic.people} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} onSkip={skipActivation} busy={magic.activating} />;
  }

  const canAddMore = magic.activation.active.length < magic.activation.limit && magic.people.some((person) => !magic.activation.active.includes(person.name));
  const title = magic.activePerson ? magic.activePerson : magic.query ? `Results for “${magic.query}”` : 'Magic Library';

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-pink-500/15 text-pink-200"><Sparkles className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-[0.22em] text-pink-100/60">Your protected memories</p><h1 className="text-3xl font-black text-white md:text-4xl">Magic Library</h1></div></div>
        <div className="relative mt-5 max-w-3xl"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input value={magic.query} onChange={(event) => magic.setQuery(event.target.value)} placeholder={magic.activePerson ? `Search memories with ${magic.activePerson}...` : 'Search people, places and things...'} className="w-full rounded-full border border-white/10 bg-white/[0.05] py-3 pl-11 pr-11 text-sm text-white outline-none focus:border-pink-400/40" />{magic.query && <button onClick={() => magic.setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35"><X className="h-4 w-4" /></button>}</div>
        {!!magic.suggestions.length && <div className="mt-3 flex flex-wrap gap-2">{magic.suggestions.map((label) => <button key={label} onClick={() => magic.setQuery(label)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55">{label}</button>)}</div>}
      </header>

      {magic.people.length > 0 && <PeopleRow people={magic.people} enabledNames={magic.activation.enabled || []} favoriteNames={magic.favoriteNames} activePerson={magic.activePerson} onOpen={magic.setActivePerson} onLocked={setLockedPerson} />}
      {magic.activePerson && <button onClick={() => magic.setActivePerson('')} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white/65">Show all memories</button>}
      {canAddMore && magic.activation.active.length > 0 && <PeopleActivation people={magic.people} limit={magic.activation.limit} activeNames={magic.activation.active} draftNames={magic.draftNames} onToggle={magic.toggleDraft} onConfirm={confirm} busy={magic.activating} />}

      <div><h2 className="text-2xl font-black text-white">{title}</h2><p className="mt-1 text-sm text-white/45">{magic.visibleItems.length} matching protected memories</p></div>
      <MediaSection title={magic.activePerson ? `Best of ${magic.activePerson} ✨` : 'Best Matches ✨'} items={magic.bestItems} onOpen={setViewer} />
      <MediaSection title={magic.activePerson ? `Videos with ${magic.activePerson}` : 'Videos'} items={magic.videos} onOpen={setViewer} />
      <MediaSection title="All Photos" items={magic.photos} onOpen={setViewer} emptyCopy="No matching photos yet." />

      <MediaViewer item={viewer} onClose={() => setViewer(null)} onChanged={magic.reload} />
      <LockedPersonPrompt person={lockedPerson} onClose={() => setLockedPerson(null)} />
    </div>
  );
}
