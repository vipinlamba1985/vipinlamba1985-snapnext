'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export default function JoinFamilyPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState('ready');
  const [message, setMessage] = useState('Join this private SnapNext Family space with your invited account.');
  const token = params.get('token') || '';

  async function accept() {
    if (!token) { setState('error'); setMessage('This invitation link is incomplete.'); return; }
    setState('loading');
    try {
      await apiFetch('/family', { method: 'PATCH', body: JSON.stringify({ action: 'accept', token }) });
      setState('done');
      setMessage('You joined the family. Your existing personal library remains private.');
      setTimeout(() => router.replace('/family'), 1200);
    } catch (error) {
      setState('error');
      setMessage(error.message || 'This invitation could not be accepted.');
    }
  }

  useEffect(() => { if (!token) { setState('error'); setMessage('This invitation link is incomplete.'); } }, [token]);

  return <div className="mx-auto max-w-xl py-12"><section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-cyan-500/25 to-purple-500/25">{state === 'done' ? <CheckCircle2 className="h-8 w-8 text-emerald-300" /> : <Users className="h-8 w-8 text-cyan-300" />}</div><h1 className="mt-5 text-3xl font-black">Family invitation</h1><p className="mt-3 text-sm leading-6 text-white/55">{message}</p>{state === 'ready' && <button onClick={accept} className="mt-6 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-6 py-3 text-sm font-bold">Accept invitation</button>}{state === 'loading' && <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-pink-300" />}{state === 'error' && <button onClick={() => router.replace('/family')} className="mt-6 rounded-full border border-white/10 px-5 py-2.5 text-sm">Open Family</button>}</section></div>;
}
