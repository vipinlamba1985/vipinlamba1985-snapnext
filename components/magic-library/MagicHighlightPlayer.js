'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { galleryThumbnailSrc } from '@/lib/gallery-media-client';
const FRAME_MS=4200;
export default function MagicHighlightPlayer({card,onClose}){
 const ids=useMemo(()=>Array.isArray(card?.asset_ids)&&card.asset_ids.length?card.asset_ids:(card?.cover_asset_id?[card.cover_asset_id]:[]),[card]);
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(true),[muted,setMuted]=useState(true);
 useEffect(()=>{setIndex(0);setPlaying(true);setMuted(true)},[card?.card_id,card?.card_key]);
 useEffect(()=>{if(!playing||ids.length<2)return;const t=setTimeout(()=>setIndex(i=>(i+1)%ids.length),FRAME_MS);return()=>clearTimeout(t)},[playing,index,ids.length]);
 useEffect(()=>{const f=e=>{if(e.key==='Escape')onClose?.()};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f)},[onClose]);
 if(!card||!ids.length)return null;
 return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] bg-black text-white">
  <div className="absolute inset-0 overflow-hidden">{ids.map((id,i)=><img key={id} src={galleryThumbnailSrc(id,1200)} alt="" className={`absolute inset-0 h-full w-full object-cover transition duration-700 ${i===index?'opacity-100 scale-105':'opacity-0 scale-100'}`}/>)}<div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/80"/></div>
  <div className="relative flex h-full flex-col p-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
   <div className="flex gap-1">{ids.map((id,i)=><span key={id} className={`h-1 flex-1 rounded-full ${i<=index?'bg-white':'bg-white/30'}`}/>)}</div>
   <div className="mt-3 flex justify-between"><button onClick={onClose} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full bg-black/40"><ArrowLeft/></button><button onClick={()=>setMuted(v=>!v)} aria-label={muted?'Unmute':'Mute'} className="grid h-11 w-11 place-items-center rounded-full bg-black/40">{muted?<VolumeX/>:<Volume2/>}</button></div>
   <button onClick={()=>setPlaying(v=>!v)} className="flex-1" aria-label={playing?'Pause highlight':'Play highlight'}/>
   <div><span className="rounded-full bg-black/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.16em]">Magic</span><h1 className="mt-3 text-3xl font-black">{card.title}</h1><div className="mt-2 flex items-center justify-between"><p className="text-sm font-bold text-white/70">{card.subtitle||`${ids.length} memories`}</p><button onClick={()=>setPlaying(v=>!v)} className="grid h-12 w-12 place-items-center rounded-full bg-white text-black">{playing?<Pause className="fill-current"/>:<Play className="fill-current"/>}</button></div></div>
  </div>
  <button onClick={()=>setIndex(i=>(i-1+ids.length)%ids.length)} className="absolute bottom-28 left-0 top-20 w-1/4" aria-label="Previous memory"/><button onClick={()=>setIndex(i=>(i+1)%ids.length)} className="absolute bottom-28 right-0 top-20 w-1/4" aria-label="Next memory"/>
 </div>
}
