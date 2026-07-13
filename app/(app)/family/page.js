'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
export default function FamilyPage(){
 const [data,setData]=useState(null);const [loading,setLoading]=useState(true);const [email,setEmail]=useState('');const [link,setLink]=useState('');
 async function load(){try{setData(await apiFetch('/family'));}catch(e){toast.error(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 async function invite(e){e.preventDefault();try{const r=await apiFetch('/family',{method:'POST',body:JSON.stringify({action:'invite',email,role:'adult'})});setLink(r.invite.joinUrl);setEmail('');await load();}catch(e){toast.error(e.message);}}
 if(loading)return <Loader2 className="h-6 w-6 animate-spin"/>;
 if(!data?.family)return <div className="rounded-3xl border border-white/10 p-8 text-center"><Users className="mx-auto"/><h1 className="mt-3 text-3xl font-bold">Family plan</h1><p className="mt-2 text-white/60">Up to six separate accounts with shared plan capacity and private personal libraries.</p><a href="/billing" className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-black">View plan</a></div>;
 const f=data.family;const owner=f.membership.role==='owner';
 return <div className="space-y-6"><section className="rounded-3xl border border-white/10 p-6"><h1 className="text-3xl font-bold">{f.household.name}</h1><p className="mt-2 text-white/60">{f.members.length} of {f.household.maxMembers} members. Personal libraries stay private unless intentionally shared.</p></section>{owner&&<section className="rounded-3xl border border-white/10 p-6"><h2 className="text-xl font-bold">Invite member</h2><form onSubmit={invite} className="mt-4 flex gap-2"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-white/5 px-4" placeholder="family@email.com"/><button className="rounded-xl bg-white px-5 py-3 text-black">Create invite</button></form>{link&&<div className="mt-3 break-all rounded-xl bg-white/5 p-3 text-xs">{link}</div>}</section>}<section className="rounded-3xl border border-white/10 p-6"><h2 className="text-xl font-bold">Members</h2><div className="mt-3 space-y-2">{f.members.map(m=><div key={m.id} className="rounded-xl bg-white/5 p-3"><div>{m.email}</div><div className="text-xs capitalize text-white/50">{m.role}</div></div>)}</div></section></div>;
}
