'use client';

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, UserCheck, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import PeopleFaceThumbnail from '@/components/magic-library/PeopleFaceThumbnail';
import { toast } from 'sonner';

export default function RecoverPeopleDialog({ onClose }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/magic-library/people/recover')
      .then((result) => { if (!cancelled) setPeople(result?.people || []); })
      .catch((error) => toast.error(error?.message || 'Could not load recoverable faces'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function recover(person, action) {
    const key = `${person.name}:${action}`;
    setBusy(key);
    try {
      await apiFetch('/magic-library/people/recover', {
        method: 'POST',
        body: JSON.stringify({ clusterId: person.name, action }),
      });
      toast.success(action === 'self' ? 'Your face was restored and pinned first' : 'Person restored');
      window.location.reload();
    } catch (error) {
      toast.error(error?.message || 'Could not recover this face');
      setBusy('');
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur" onClick={onClose}>
    <div className="relative my-4 w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0414] p-5" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 text-white/50" aria-label="Close recovery"><X className="h-5 w-5" /></button>
      <div className="pr-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-pink-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-pink-200"><RotateCcw className="h-3.5 w-3.5" />Recover people</div>
        <h2 className="mt-3 text-2xl font-black text-white">Find a missing face</h2>
        <p className="mt-2 text-sm leading-6 text-white/50">These faces already exist in your database but were hidden, rejected, marked Unknown, or left in an older People version. Restoring one does not rerun AWS recognition.</p>
      </div>

      {loading ? <div className="grid min-h-48 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-pink-300" /></div> : people.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {people.map((person) => {
          const selfBusy = busy === `${person.name}:self`;
          const restoreBusy = busy === `${person.name}:restore`;
          return <div key={person.name} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <PeopleFaceThumbnail mediaId={person.representativeMediaId} faceBox={person.representativeFaceBox} manual={person.thumbnailCrop || {}} className="mx-auto h-28 w-20 rounded-2xl border border-white/10" />
            <p className="mt-2 truncate text-xs font-black text-white/80">{person.isSelf ? 'You' : person.displayName === 'Add name' ? 'Unlabeled face' : person.displayName}</p>
            <p className="text-[10px] text-white/35">{Number(person.count || 0)} memories · {person.recoveryReason}</p>
            <button type="button" onClick={() => recover(person, 'self')} disabled={Boolean(busy)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-2 py-2 text-[11px] font-black text-white disabled:opacity-45">{selfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}This is me</button>
            <button type="button" onClick={() => recover(person, 'restore')} disabled={Boolean(busy)} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2 py-2 text-[11px] font-black text-white/65 disabled:opacity-45">{restoreBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Restore person</button>
          </div>;
        })}
      </div> : <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-center">
        <p className="text-sm font-black text-white">No recoverable face records found</p>
        <p className="mt-2 text-xs leading-5 text-white/40">Your face may still be inside the photos waiting for a People scan, or it may be grouped inside another visible person.</p>
      </div>}

      <p className="mt-4 text-center text-[10px] leading-4 text-white/30">Recovery only changes existing SnapNext database records. It creates no new image and makes no additional Rekognition request.</p>
    </div>
  </div>;
}
