'use client';
import { useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
export default function JoinFamilyPage(){const q=useSearchParams();const [m,setM]=useState('Joining your Family…');useEffect(()=>{const token=q.get('token');if(!token){setM('Invitation link is missing.');return;}apiFetch('/family',{method:'POST',body:JSON.stringify({action:'accept',token})}).then(()=>setM('You joined the Family. Your personal library remains private until you share something.')).catch(e=>setM(e.message||'Invitation could not be accepted.'));},[q]);return <div className="mx-auto max-w-xl rounded-3xl border border-white/10 p-8 text-center"><h1 className="text-3xl font-bold">SnapNext Family</h1><p className="mt-4 text-white/60">{m}</p><a href="/family" className="mt-6 inline-block rounded-full bg-white px-5 py-2 text-black">Open Family</a></div>}
