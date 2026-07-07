'use client';

import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';

export default function LockedPersonPrompt({ person, onClose }) {
  if (!person) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0414] p-6" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-white/50"><X className="h-5 w-5" /></button>
        <Sparkles className="h-8 w-8 text-pink-300" />
        <h2 className="mt-4 text-2xl font-black text-white">{person.name} is waiting in your Magic Library</h2>
        <p className="mt-3 text-sm leading-6 text-white/55">SnapNext found {person.photos} photos and {person.videos} videos linked to this person label in your protected memories.</p>
        <p className="mt-3 text-sm leading-6 text-white/55">Your current plan has no remaining active people slots. Upgrade to keep more people ready for one-tap search.</p>
        <Link href="/billing" className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-black text-white">Unlock More People</Link>
      </div>
    </div>
  );
}
