'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, ShieldCheck, UserRound, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import PeopleFaceThumbnail from '@/components/magic-library/PeopleFaceThumbnail';
import { isUnknownPerson } from '@/lib/people-identity';
import { mediaCategory } from '@/lib/media-category';
import { publishLibraryRefresh } from '@/lib/library-refresh';
import { toast } from 'sonner';

const INITIAL_CANDIDATES = 5;
const MAX_CANDIDATES = 20;

function candidateScore(person = {}) {
  return (person.thumbnailEligible !== false ? 1000 : 0)
    + Math.min(Number(person.distinctPhotoCount ?? person.photos ?? person.count ?? 0), 100) * 10
    + Math.min(Number(person.representativeQuality || 0), 100);
}

function eligibleCandidates(people = [], items = []) {
  const mediaById = new Map(items.map((item) => [String(item.id), item]));
  return people
    .filter((person) => {
      if (!person || person.isSelf || isUnknownPerson(person)) return false;
      if (person.thumbnailEligible === false) return false;
      if (!person.representativeMediaId || !person.representativeFaceBox) return false;
      const representative = mediaById.get(String(person.representativeMediaId));
      // When the representative is in the bounded Library payload, remove
      // screenshots/docs immediately. The server repeats this check before save.
      if (representative && mediaCategory(representative) !== 'photos') return false;
      return true;
    })
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, MAX_CANDIDATES);
}

export default function SelfPersonPicker({ people = [], items = [], onConfirmed }) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const alreadyConfirmed = people.some((person) => Boolean(person?.isSelf));
  const candidates = useMemo(() => eligibleCandidates(people, items), [people, items]);
  const visible = candidates.slice(0, expanded ? MAX_CANDIDATES : INITIAL_CANDIDATES);

  if (alreadyConfirmed || dismissed || !candidates.length) return null;

  async function confirmSelf() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await apiFetch('/magic-library/people/self', {
        method: 'POST',
        body: JSON.stringify({ clusterId: selected }),
      });
      toast.success('You are confirmed. SnapNext can now organize memories around you.');
      publishLibraryRefresh({ source: 'self-person-confirmed' });
      await onConfirmed?.();
    } catch (error) {
      toast.error(error?.message || 'Could not confirm this face. Choose another photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 px-0 backdrop-blur-sm sm:items-center sm:p-5" data-testid="self-person-picker" role="dialog" aria-modal="true" aria-labelledby="self-person-picker-title">
      <section className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[2.25rem] border border-white/10 bg-[#100918] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 shadow-2xl shadow-black/60 sm:max-w-xl sm:rounded-[2rem] sm:p-7">
        <button type="button" onClick={() => setDismissed(true)} aria-label="Not now" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/[0.07] text-white/55"><X className="h-5 w-5" /></button>

        <div className="pr-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/25 to-purple-500/20 text-pink-100"><UserRound className="h-6 w-6" /></span>
          <h2 id="self-person-picker-title" className="mt-3 text-3xl font-black tracking-tight text-white">Which photo is you?</h2>
          <p className="mt-1 text-sm font-bold text-white/55">Confirm once so your memories can become personal.</p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5">
          {visible.map((person) => {
            const active = selected === person.name;
            return (
              <button key={person.name} type="button" onClick={() => setSelected(person.name)} className="group text-center" aria-pressed={active} aria-label="Choose this face as you">
                <span className={`relative mx-auto block aspect-square w-full max-w-[96px] overflow-hidden rounded-full border-[3px] bg-white/5 transition ${active ? 'border-pink-300 ring-4 ring-pink-500/25' : 'border-white/15 group-active:scale-[0.97]'}`}>
                  <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} className="h-full w-full" />
                  {active && <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-pink-400 text-black ring-2 ring-[#100918]"><Check className="h-4 w-4" /></span>}
                </span>
                <span className="mt-2 block text-[11px] font-bold text-white/55">{Number(person.distinctPhotoCount ?? person.photos ?? person.count ?? 0)} photos</span>
              </button>
            );
          })}
        </div>

        {candidates.length > INITIAL_CANDIDATES && !expanded && (
          <button type="button" onClick={() => setExpanded(true)} className="mx-auto mt-5 flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-4 text-xs font-black text-white/70">
            <ChevronDown className="h-4 w-4" /> More faces
          </button>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={confirmSelf} disabled={!selected || busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {busy ? 'Confirming…' : "Yes, that's me"}
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="min-h-12 rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-black text-white/60">None of these / later</button>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3 text-xs leading-5 text-emerald-100/70">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>This only records which existing People face represents you. It does not turn on cloud recognition, create a new biometric search, or share any photo.</p>
        </div>
      </section>
    </div>
  );
}
