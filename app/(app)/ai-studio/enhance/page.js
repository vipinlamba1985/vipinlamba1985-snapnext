'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { ArrowLeftRight, Brush, Crop, Download, FlipHorizontal, FlipVertical, Images, Loader2, Redo2, RotateCcw, RotateCw, Save, SlidersHorizontal, Sparkles, Undo2, X } from 'lucide-react';

const DEFAULTS = { brightness: 100, contrast: 100, saturate: 100, warmth: 0, highlights: 0, shadows: 0, clarity: 0, denoise: 0, rotation: 0, straighten: 0, flipX: 1, flipY: 1, aspect: 'original', upscale: 1 };
const PRESETS = {
  natural: { brightness: 105, contrast: 107, saturate: 108, warmth: 2, highlights: -2, shadows: 5, clarity: 5 },
  archive: { brightness: 109, contrast: 116, saturate: 110, warmth: 8, highlights: -8, shadows: 10, clarity: 9, denoise: 12 },
  lowlight: { brightness: 120, contrast: 104, saturate: 106, warmth: 3, highlights: -15, shadows: 22, clarity: 4, denoise: 10 },
  portrait: { brightness: 108, contrast: 102, saturate: 105, warmth: 6, highlights: -7, shadows: 10, clarity: 1, denoise: 8 },
  travel: { brightness: 104, contrast: 112, saturate: 124, warmth: 5, highlights: -7, shadows: 5, clarity: 11 },
  baby: { brightness: 109, contrast: 98, saturate: 103, warmth: 8, highlights: -8, shadows: 10, clarity: -2, denoise: 8 },
  document: { brightness: 112, contrast: 130, saturate: 25, warmth: 0, highlights: 4, shadows: -6, clarity: 18 },
  golden: { brightness: 105, contrast: 106, saturate: 112, warmth: 16, highlights: -5, shadows: 7, clarity: 4 },
};
const ASPECTS = [['original','Original'],['1:1','Square'],['4:3','Classic'],['3:2','Photo'],['16:9','Wide']];
const AI_ACTIONS = [
  { id:'hd-upscale', name:'AI HD Restore', detail:'Recover missing detail with advanced restoration.', credits:12 },
  { id:'low-light', name:'Advanced Low-Light Repair', detail:'Improve very dark photos while protecting faces.', credits:10 },
  { id:'denoise', name:'Advanced Denoise', detail:'Reduce heavy grain and recover clarity.', credits:10 },
  { id:'portrait', name:'Gentle Portrait Recovery', detail:'Improve a damaged portrait without changing identity.', credits:12 },
  { id:'restore', name:'Severe Damage Repair', detail:'Repair fading, scratches and lost contrast.', credits:20 },
];

function ratioFor(aspect, width, height) {
  if (aspect === 'original') return width / height;
  const [w,h] = aspect.split(':').map(Number);
  return w / h;
}
function filterFor(a) {
  const brightness = Math.max(40, a.brightness + a.shadows * .18 + a.highlights * .08);
  const contrast = Math.max(40, a.contrast + a.clarity * .35);
  const sepia = Math.max(0, a.warmth) / 250;
  const hue = a.warmth < 0 ? a.warmth / 5 : 0;
  const blur = Math.max(0, a.denoise) * .025;
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${a.saturate}%) sepia(${sepia}) hue-rotate(${hue}deg) blur(${blur}px)`;
}
function analyzeStats(data) {
  let light=0, lightSq=0, saturation=0, edges=0, previous=0;
  const pixels=data.length/4;
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    const lum=.2126*r+.7152*g+.0722*b;
    light+=lum; lightSq+=lum*lum; saturation+=Math.max(r,g,b)-Math.min(r,g,b);
    if(i>4 && Math.abs(lum-previous)>28) edges++; previous=lum;
  }
  const mean=light/pixels;
  return { brightness:mean, contrast:Math.sqrt(Math.max(0,lightSq/pixels-mean*mean)), saturation:saturation/pixels, edgeDensity:edges/pixels*100 };
}
function suggestion(s) {
  if(s.brightness<72) return { preset:'lowlight', title:'This photo looks a little dark', reason:'We can lift the shadows and gently reduce visible grain.' };
  if(s.contrast<34 && s.saturation<38) return { preset:'archive', title:'This photo looks softly faded', reason:'Family Archive can restore contrast and color while keeping its character.' };
  if(s.saturation<32) return { preset:'natural', title:'The colors look a little quiet', reason:'Natural Auto can bring them back gently.' };
  if(s.edgeDensity<8) return { preset:'archive', title:'The photo looks a little soft', reason:'A careful detail boost and light cleanup may help.' };
  return { preset:'natural', title:'This photo is already in good shape', reason:'A light natural polish should be enough.' };
}

export default function EnhancePhotoPage(){
  const [photos,setPhotos]=useState([]), [selectedId,setSelectedId]=useState(''), [batch,setBatch]=useState([]);
  const [adjust,setAdjust]=useState(DEFAULTS), [history,setHistory]=useState([DEFAULTS]), [historyIndex,setHistoryIndex]=useState(0);
  const [analysis,setAnalysis]=useState(null), [providerReady,setProviderReady]=useState(false), [busy,setBusy]=useState(''), [result,setResult]=useState(null);
  const [showOriginal,setShowOriginal]=useState(false), [repairMode,setRepairMode]=useState(false), [repairMarks,setRepairMarks]=useState([]), [batchMode,setBatchMode]=useState(false);
  const imageRef=useRef(null);

  useEffect(()=>{ Promise.all([apiFetch('/media?filter=photo'),apiFetch('/ai-enhance-photo')]).then(([m,s])=>{setPhotos((m.items||[]).slice(0,60));setProviderReady(Boolean(s.providerReady));}).catch(e=>toast.error(e.message||'We could not open Enhance Photo.')); },[]);
  const filter=useMemo(()=>filterFor(adjust),[adjust]);
  const transform=useMemo(()=>`rotate(${adjust.rotation+adjust.straighten}deg) scaleX(${adjust.flipX}) scaleY(${adjust.flipY})`,[adjust]);

  function reset(){ setAdjust(DEFAULTS);setHistory([DEFAULTS]);setHistoryIndex(0);setAnalysis(null);setRepairMarks([]);setResult(null); }
  function commit(next){ const clean={...DEFAULTS,...next};const list=[...history.slice(0,historyIndex+1),clean].slice(-30);setHistory(list);setHistoryIndex(list.length-1);setAdjust(clean);setResult(null); }
  function setValue(key,value){ setAdjust(a=>({...a,[key]:value}));setResult(null); }
  function undo(){ if(historyIndex>0){const i=historyIndex-1;setHistoryIndex(i);setAdjust(history[i]);} }
  function redo(){ if(historyIndex<history.length-1){const i=historyIndex+1;setHistoryIndex(i);setAdjust(history[i]);} }
  function applyPreset(id){ commit({...DEFAULTS,...PRESETS[id]});toast.success('A gentle new look has been applied.'); }

  async function study(){
    if(!imageRef.current) return toast.error('Choose a photo first.');
    setBusy('study');
    try{ const img=imageRef.current,c=document.createElement('canvas'),scale=Math.min(1,180/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,c.width,c.height);setAnalysis(suggestion(analyzeStats(x.getImageData(0,0,c.width,c.height).data))); }
    catch{toast.error('We could not study this photo. You can still edit it normally.');}finally{setBusy('');}
  }

  function renderCanvas(img= imageRef.current, edit=adjust, marks=repairMarks, qualityMode='high'){
    if(!img) throw new Error('Choose a photo first.');
    const rotation=((edit.rotation%360)+360)%360, swap=rotation===90||rotation===270;
    const sw=img.naturalWidth,sh=img.naturalHeight,ratio=ratioFor(edit.aspect,sw,sh);let cw=sw,ch=sh;if(sw/sh>ratio)cw=sh*ratio;else ch=sw/ratio;
    const sx=(sw-cw)/2,sy=(sh-ch)/2,scale=qualityMode==='share'?Math.min(1,1600/Math.max(cw,ch)):edit.upscale;
    const outW=Math.max(1,Math.round((swap?ch:cw)*scale)),outH=Math.max(1,Math.round((swap?cw:ch)*scale));
    const c=document.createElement('canvas');c.width=outW;c.height=outH;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.save();ctx.translate(outW/2,outH/2);ctx.rotate(((edit.rotation+edit.straighten)*Math.PI)/180);ctx.scale(edit.flipX*scale,edit.flipY*scale);ctx.filter=filterFor(edit);ctx.drawImage(img,sx,sy,cw,ch,-cw/2,-ch/2,cw,ch);ctx.restore();
    if(marks.length){ctx.save();for(const m of marks){const x=m.x*outW,y=m.y*outH,r=Math.max(10,m.size*outW);ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();ctx.filter='blur(8px)';ctx.globalAlpha=.88;ctx.drawImage(c,Math.max(0,x-r*1.4),Math.max(0,y-r*1.4),r*2.8,r*2.8,Math.max(0,x-r),Math.max(0,y-r),r*2,r*2);ctx.restore();}ctx.restore();}
    return c;
  }
  function imageData(mode='high',img=imageRef.current,edit=adjust,marks=repairMarks){return renderCanvas(img,edit,marks,mode).toDataURL('image/jpeg',mode==='share'?.84:.95);}
  function download(mode){try{const a=document.createElement('a');a.download=`snapnext-enhanced-${Date.now()}.jpg`;a.href=imageData(mode);a.click();toast.success('Your enhanced copy is ready. The original stayed unchanged.');}catch(e){toast.error(e.message);} }
  async function saveToLibrary(mode='high'){
    if(!selectedId) return toast.error('Choose a photo first.');setBusy('save');
    try{await apiFetch('/photo-edits',{method:'POST',body:JSON.stringify({sourceMediaId:selectedId,imageData:imageData(mode),name:`snapnext-enhanced-${Date.now()}.jpg`,editHistory:[...history.slice(0,historyIndex+1),{repairMarks:repairMarks.length}],recipe:analysis?.title||'Custom enhancement'})});toast.success('Your enhanced copy is saved in SnapNext.');}
    catch(e){toast.error(e.message||'We could not save this copy.');}finally{setBusy('');}
  }
  function markRepair(e){if(!repairMode||!imageRef.current)return;const r=e.currentTarget.getBoundingClientRect();setRepairMarks(v=>[...v,{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,size:.018}].slice(-40));}
  async function batchSave(){
    if(!batch.length)return toast.error('Choose photos for the batch first.');setBusy('batch');let saved=0,failed=0;
    for(const id of batch.slice(0,10)){try{const img=new Image();img.crossOrigin='anonymous';img.src=mediaSrc(id);await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;});const data=imageData('share',img,adjust,[]);await apiFetch('/photo-edits',{method:'POST',body:JSON.stringify({sourceMediaId:id,imageData:data,name:`snapnext-batch-enhanced-${Date.now()}-${saved}.jpg`,editHistory:[adjust],recipe:'Batch Smart Enhance'})});saved++;}catch{failed++;}}
    setBusy('');toast.success(`${saved} enhanced ${saved===1?'copy':'copies'} saved${failed?` · ${failed} could not be finished`:''}.`);setBatch([]);
  }
  async function runAi(action){if(!selectedId)return;setBusy(action.id);try{const r=await apiFetch('/ai-enhance-photo',{method:'POST',body:JSON.stringify({mediaId:selectedId,action:action.id})});setResult(r.job);toast.success('Your restored copy is ready.');}catch(e){toast.error(e.message||'We could not finish this one. Your Credits were not used.');}finally{setBusy('');}}

  const preview=result?.outputUrl||(selectedId?mediaSrc(selectedId):'');
  return <div className="space-y-6 pb-24">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-black">Enhance Photo</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Improve, repair and save new versions of your memories. Free tools work on your device and never overwrite the original.</p></div><span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200">Complete free editor ready</span></header>

    <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-black">Choose photos</h2><button onClick={()=>{setBatchMode(v=>!v);setBatch([]);}} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-bold"><Images className="h-4 w-4"/>{batchMode?'Single photo':'Batch enhance'}</button></div>
      <p className="mt-1 text-xs text-white/45">{batchMode?'Choose up to 10 photos. The same free enhancement will be saved as a new copy for each one.':'Choose one photo to edit in detail.'}</p>
      <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">{photos.map(p=>{const active=batchMode?batch.includes(p.id):selectedId===p.id;return <button key={p.id} onClick={()=>batchMode?setBatch(v=>v.includes(p.id)?v.filter(x=>x!==p.id):v.length<10?[...v,p.id]:v):(setSelectedId(p.id),reset())} className={`relative aspect-square overflow-hidden rounded-xl border-2 ${active?'border-cyan-400':'border-transparent'}`}><img src={mediaSrc(p.id)} alt="" className="h-full w-full object-cover"/>{batchMode&&active&&<span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-cyan-400 text-[10px] font-black text-black">✓</span>}</button>})}</div>
      {batchMode&&<button onClick={batchSave} disabled={!batch.length||busy==='batch'} className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 text-sm font-black text-black disabled:opacity-40">{busy==='batch'?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save enhanced batch ({batch.length})</button>}
    </section>

    {!batchMode&&<div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section className="rounded-[2rem] border border-white/10 bg-black/20 p-4"><div onClick={markRepair} className={`relative grid min-h-[440px] place-items-center overflow-hidden rounded-3xl bg-black/40 ${repairMode?'cursor-crosshair':''}`}>{preview?<img ref={imageRef} crossOrigin="anonymous" src={preview} alt="Enhancement preview" style={{filter:result||showOriginal?'none':filter,transform:result||showOriginal?'none':transform}} className="max-h-[72vh] w-full object-contain"/>:<p className="text-sm text-white/35">Choose a photo to begin.</p>}{repairMarks.map((m,i)=><span key={i} className="pointer-events-none absolute h-5 w-5 rounded-full border border-cyan-300/80 bg-cyan-300/20" style={{left:`calc(${m.x*100}% - 10px)`,top:`calc(${m.y*100}% - 10px)`}}/>)}{preview&&!result&&<button onPointerDown={e=>{e.stopPropagation();setShowOriginal(true)}} onPointerUp={()=>setShowOriginal(false)} onPointerLeave={()=>setShowOriginal(false)} className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-bold"><ArrowLeftRight className="h-4 w-4"/>Hold to see before</button>}</div>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>saveToLibrary('high')} disabled={!selectedId||busy==='save'||Boolean(result)} className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2 text-sm font-black text-black disabled:opacity-40">{busy==='save'?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save in SnapNext</button><button onClick={()=>download('high')} disabled={!selectedId||Boolean(result)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold"><Download className="h-4 w-4"/>High quality</button><button onClick={()=>download('share')} disabled={!selectedId||Boolean(result)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold"><Download className="h-4 w-4"/>Share ready</button><button onClick={undo} disabled={historyIndex<=0} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 disabled:opacity-30"><Undo2 className="h-4 w-4"/></button><button onClick={redo} disabled={historyIndex>=history.length-1} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 disabled:opacity-30"><Redo2 className="h-4 w-4"/></button><button onClick={reset} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold"><RotateCcw className="h-4 w-4"/>Start over</button></div><p className="mt-3 text-xs text-white/40">Saved edits become new memories with their edit history. Your original always remains unchanged.</p>
      </section>

      <aside className="space-y-5">
        <section className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-5"><div className="flex items-center gap-2 font-black"><Sparkles className="h-4 w-4 text-cyan-300"/>Smart Enhance · Free</div><p className="mt-2 text-xs text-white/55">Studies light, color, softness and grain on your device.</p>{analysis&&<div className="mt-4 rounded-2xl bg-black/20 p-4"><p className="text-sm font-black">{analysis.title}</p><p className="mt-1 text-xs text-white/50">{analysis.reason}</p></div>}<button onClick={()=>analysis?applyPreset(analysis.preset):study()} disabled={!selectedId||busy==='study'} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-black text-black disabled:opacity-40">{busy==='study'?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}{analysis?'Apply Smart Enhance':'Study this photo'}</button></section>
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="font-black">Memory looks · Free</div><div className="mt-4 grid grid-cols-2 gap-2">{[['natural','Natural Auto'],['archive','Family Archive'],['lowlight','Low-Light Rescue'],['portrait','Portrait Glow'],['travel','Travel Pop'],['baby','Baby Soft'],['document','Document Cleanup'],['golden','Golden Memory']].map(([id,l])=><button key={id} onClick={()=>applyPreset(id)} disabled={!selectedId} className="rounded-2xl bg-white/5 px-3 py-3 text-sm font-bold disabled:opacity-35">{l}</button>)}</div></section>
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center gap-2 font-black"><Brush className="h-4 w-4"/>Repair and details · Free</div><button onClick={()=>setRepairMode(v=>!v)} disabled={!selectedId} className={`mt-4 w-full rounded-2xl px-3 py-3 text-sm font-bold ${repairMode?'bg-cyan-500 text-black':'bg-white/5'}`}>{repairMode?'Tap spots on the photo · Done':'Spot fix dust or small marks'}</button>{repairMarks.length>0&&<button onClick={()=>setRepairMarks([])} className="mt-2 inline-flex items-center gap-1 text-xs text-white/50"><X className="h-3 w-3"/>Clear {repairMarks.length} fixes</button>}<div className="mt-4 space-y-4">{[['denoise','Reduce grain',0,30],['clarity','Details',-20,30],['upscale','Larger & sharper',1,2]].map(([k,l,min,max])=><label key={k} className="block text-xs text-white/60"><span className="flex justify-between"><b>{l}</b><span>{adjust[k]}{k==='upscale'?'×':''}</span></span><input type="range" min={min} max={max} step={k==='upscale'?0.25:1} value={adjust[k]} onChange={e=>setValue(k,Number(e.target.value))} onPointerUp={()=>commit(adjust)} className="mt-2 w-full"/></label>)}</div></section>
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center gap-2 font-black"><Crop className="h-4 w-4"/>Crop and position · Free</div><div className="mt-4 grid grid-cols-3 gap-2">{ASPECTS.map(([id,l])=><button key={id} onClick={()=>commit({...adjust,aspect:id})} className={`rounded-xl px-2 py-2 text-xs font-bold ${adjust.aspect===id?'bg-cyan-500 text-black':'bg-white/5'}`}>{l}</button>)}</div><div className="mt-4 flex gap-2"><button onClick={()=>commit({...adjust,rotation:(adjust.rotation-90)%360})} className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><RotateCcw className="h-4 w-4"/></button><button onClick={()=>commit({...adjust,rotation:(adjust.rotation+90)%360})} className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><RotateCw className="h-4 w-4"/></button><button onClick={()=>commit({...adjust,flipX:adjust.flipX*-1})} className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><FlipHorizontal className="h-4 w-4"/></button><button onClick={()=>commit({...adjust,flipY:adjust.flipY*-1})} className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><FlipVertical className="h-4 w-4"/></button></div></section>
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center gap-2 font-black"><SlidersHorizontal className="h-4 w-4"/>Fine tune · Free</div><div className="mt-4 space-y-4">{[['brightness','Brightness',60,140],['contrast','Contrast',60,140],['saturate','Color',50,160],['warmth','Warmth',-30,30],['highlights','Highlights',-30,30],['shadows','Shadows',-30,30],['straighten','Straighten',-10,10]].map(([k,l,min,max])=><label key={k} className="block text-xs text-white/60"><span className="flex justify-between"><b>{l}</b><span>{adjust[k]}</span></span><input type="range" min={min} max={max} step={k==='straighten'?.5:1} value={adjust[k]} onChange={e=>setValue(k,Number(e.target.value))} onPointerUp={()=>commit(adjust)} className="mt-2 w-full"/></label>)}</div></section>
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-5"><h2 className="font-black">Advanced restoration</h2><p className="mt-1 text-xs text-white/45">For severe damage only. Credits are used after a result is ready.</p><div className="mt-3 space-y-2">{AI_ACTIONS.map(a=><button key={a.id} onClick={()=>runAi(a)} disabled={Boolean(busy)||!selectedId||!providerReady} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 text-left disabled:opacity-40"><span><b className="text-sm">{a.name}</b><span className="mt-1 block text-xs text-white/45">{a.detail}</span></span><span className="text-xs font-bold text-cyan-200">{busy===a.id?<Loader2 className="h-4 w-4 animate-spin"/>:`Uses ${a.credits}`}</span></button>)}</div>{!providerReady&&<p className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-white/55">Advanced restoration is coming later. Every free editing tool above is ready now.</p>}</section>
      </aside>
    </div>}
  </div>;
}
