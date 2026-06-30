'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, Images, Sparkles, Users, UserCircle, Camera, Bell, Search, Plus, Send, Smartphone, Cloud, Instagram, Facebook, Star, Heart, Monitor, Plane, FileText, MapPin, CalendarDays, Folder, MessageCircle, Play, ImagePlus, Layers, Share2, Settings, CheckCircle2, ChevronRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { getStoredUser, getToken } from '@/lib/api-client';
import BrandLogo from '@/components/BrandLogo';

const statuses = [
  { name: 'Add status', time: 'Share a moment', color: 'from-[#181120] to-[#05020a]', add: true },
  { name: 'My Wifi ❤️', time: 'Just now', color: 'from-emerald-600 via-lime-700 to-black' },
  { name: 'Mamtu Sahota Ji', time: '1h ago', color: 'from-stone-700 via-rose-900 to-black' },
  { name: 'Rajwinder Kaur Ji', time: '2h ago', color: 'from-orange-600 via-red-800 to-black' },
];

const people = [
  { name: 'Emma', relation: 'Sister', emoji: '👩', color: 'from-pink-500 to-rose-500', count: 183, update: '12 new memories · Birthday collage ready ❤️' },
  { name: 'Marcus', relation: 'Partner', emoji: '👨', color: 'from-indigo-500 to-blue-500', count: 146, update: '4 photos shared · Weekend reel suggested' },
  { name: 'Mom & Dad', relation: 'Parents', emoji: '👵', color: 'from-amber-400 to-orange-500', count: 92, update: '3 family moments · Father’s Day post ready' },
  { name: 'Lucas', relation: 'Friend', emoji: '👦', color: 'from-emerald-400 to-teal-500', count: 61, update: 'Trip memories found' },
];

const communities = [
  { name: 'Family Album', members: 8, memories: 247, last: 'Mom added 3 photos', color: 'from-pink-500 to-purple-700' },
  { name: 'Mexico Trip', members: 6, memories: 124, last: 'Marcus started a chat', color: 'from-cyan-400 to-indigo-700' },
  { name: 'Wedding Memories', members: 24, memories: 612, last: 'AI story ready', color: 'from-amber-400 to-rose-600' },
];

const folders = [
  { name: 'Favorites', count: 184, icon: Heart, color: 'from-pink-500 to-rose-600' },
  { name: 'Favorite People', count: 482, icon: Users, color: 'from-purple-500 to-indigo-600' },
  { name: 'Screenshots', count: 126, icon: Monitor, color: 'from-slate-500 to-slate-800' },
  { name: 'Trips', count: 321, icon: Plane, color: 'from-cyan-400 to-blue-700' },
  { name: 'Documents', count: 48, icon: FileText, color: 'from-amber-400 to-orange-700' },
  { name: 'Places', count: 93, icon: MapPin, color: 'from-emerald-400 to-teal-700' },
  { name: 'Vacations', count: 214, icon: Images, color: 'from-fuchsia-500 to-purple-800' },
  { name: 'Years', count: 12, icon: CalendarDays, color: 'from-indigo-400 to-violet-800' },
  { name: 'Albums', count: 37, icon: Folder, color: 'from-blue-400 to-cyan-700' },
];

const syncSources = [
  { name: 'Phone Library', icon: Smartphone, sub: 'All photos after approval', color: 'from-pink-500 to-purple-700' },
  { name: 'Clouds', icon: Cloud, sub: 'iCloud, Google, drives', color: 'from-cyan-400 to-indigo-700' },
  { name: 'Instagram', icon: Instagram, sub: 'Thumbnails + updates', color: 'from-orange-400 to-pink-600' },
  { name: 'Facebook', icon: Facebook, sub: 'Albums + updates', color: 'from-blue-500 to-indigo-700' },
];

const best = ['Best Smile', 'Best Travel Shot', 'Best Family Moment', 'Best Memory'];

function Page({ children }) { return <div className="space-y-7 pb-3">{children}</div>; }
function Title({ title, sub, action }) { return <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-xl font-black text-white">{title}</h2>{sub && <p className="mt-1 text-sm text-white/50">{sub}</p>}</div>{action && <button className="text-sm font-black text-pink-300">{action}</button>}</div>; }
function StatusCard({ s }) { return <button className={`relative min-h-[210px] min-w-[132px] overflow-hidden rounded-[26px] border border-white/15 bg-gradient-to-br ${s.color} p-4 text-left shadow-xl`}><div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,.2),transparent_35%),linear-gradient(to_top,rgba(0,0,0,.82),transparent_70%)]" />{!s.add && <div className="absolute left-3 right-3 top-3 h-1 rounded-full bg-white/25"><div className="h-full w-3/4 rounded-full bg-white/80" /></div>}<div className="relative flex h-full flex-col justify-between"><div className="flex justify-end">{s.add && <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Camera className="h-6 w-6" /></span>}</div><div>{s.add && <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-purple-600"><Plus className="h-6 w-6" /></div>}<div className="text-lg font-black text-white">{s.name}</div><div className="mt-1 text-xs font-bold text-white/65">{s.time}</div></div></div></button>; }
function FolderCard({ f }) { const Icon = f.icon; return <button className="rounded-[26px] border border-white/10 bg-white/[0.06] p-3 text-left"><div className={`mb-3 aspect-[4/3] rounded-[22px] bg-gradient-to-br ${f.color} p-3`}><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/18"><Icon className="h-5 w-5" /></div></div><div className="font-black text-white">{f.name}</div><div className="text-xs text-white/45">{f.count} items</div></button>; }
function SourceCard({ s }) { const Icon = s.icon; return <button className="rounded-[26px] border border-white/10 bg-white/[0.06] p-4 text-left"><div className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${s.color}`}><Icon className="h-6 w-6" /></div><div className="font-black text-white">{s.name}</div><div className="mt-1 text-xs text-white/55">{s.sub}</div><div className="mt-4 rounded-full bg-white px-4 py-2 text-center text-xs font-black text-black">Connect</div></button>; }
function Quick({ icon: Icon, title, sub }) { return <button className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4 text-left"><div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Icon className="h-5 w-5" /></div><div className="text-sm font-black text-white">{title}</div><div className="text-xs text-white/55">{sub}</div></button>; }

function HomeView({ setTab, user }) { 
  return <Page>
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-pink-300">
            {user ? `Welcome back, ${user.name} 👋` : 'Good evening, Vipin 👋'}
          </p>
          <h1 className="text-3xl font-black text-white">Your Digital Life, Ready</h1>
          <p className="mt-2 text-sm text-white/55">SnapNext prepares memories, posts, reels, and collages from your approved sources.</p>
          
          {/* Dashboard / Auth visible CTA buttons */}
          <div className="mt-6 flex flex-wrap gap-3">
            {user ? (
              <>
                <Link href="/dashboard" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-xs font-black uppercase tracking-wider hover:brightness-110 transition shadow-lg shadow-pink-500/20">
                  Go to Dashboard
                </Link>
                <Link href="/dashboard?tab=upload" className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/10 text-xs font-black uppercase tracking-wider hover:bg-white/20 transition">
                  Upload Media
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-xs font-black uppercase tracking-wider hover:brightness-110 transition shadow-lg shadow-pink-500/20">
                  Create Free Account
                </Link>
                <Link href="/login" className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/10 text-xs font-black uppercase tracking-wider hover:bg-white/20 transition">
                  Sign In to Gallery
                </Link>
              </>
            )}
          </div>
        </div>
        <button onClick={() => setTab('profile')} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 shrink-0">
          <Settings className="h-5 w-5" />
        </button>
      </div>
      <Title title="Recent Status" action="View all" />
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto overflow-y-visible px-4 pb-2 pt-3">
        {statuses.map((s) => <StatusCard key={s.name} s={s} />)}
      </div>
    </section>
    <section>
      <Title title="Today’s Ready-to-Post" sub="AI picked the best moments for social sharing" action="See all" />
      <div className="space-y-3">
        {['Today’s best post · Beach Weekend ready for Instagram','Father’s Day collage · 8 photos with Dad selected','Weekend reel · 12 clips with music idea'].map((t) => (
          <div key={t} className="rounded-[28px] border border-pink-400/20 bg-gradient-to-br from-pink-500/15 to-purple-700/15 p-4 font-bold text-white">
            {t}
          </div>
        ))}
      </div>
    </section>
    <section>
      <Title title="People Activity" sub="Live updates from your private circle" />
      <div className="space-y-2">
        {people.slice(0,3).map((p) => (
          <div key={p.name} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.06] p-3">
            <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${p.color} text-xl`}>
              {p.emoji}
            </div>
            <div className="flex-1">
              <div className="font-black text-white">{p.name}</div>
              <p className="text-xs text-white/50">{p.update}</p>
            </div>
            <MessageCircle className="h-5 w-5 text-pink-300" />
          </div>
        ))}
      </div>
    </section>
  </Page>; 
}

function GalleryView() { return <Page><div><p className="text-sm font-bold text-pink-300">Smart Gallery</p><h1 className="text-3xl font-black text-white">Find anything fast</h1><p className="mt-2 text-sm text-white/50">Folders for people, trips, screenshots, documents, places, years, and AI picks.</p></div><div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.07] px-4 py-3"><Search className="h-5 w-5 text-white/50" /><input className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35" placeholder="Search anything in your gallery..." /></div><div className="grid grid-cols-2 gap-3">{folders.map((f) => <FolderCard key={f.name} f={f} />)}</div><section><Title title="Best of You" sub="Always visible: your best pictures selected by SnapNext AI" action="View all" /><div className="grid grid-cols-2 gap-3">{best.map((title, i) => <div key={title} className={`relative min-h-[190px] rounded-[28px] bg-gradient-to-br ${['from-pink-400 via-fuchsia-500 to-purple-700','from-cyan-300 via-blue-500 to-indigo-700','from-amber-300 via-orange-500 to-rose-600','from-emerald-300 via-teal-500 to-cyan-700'][i]} p-4`}><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20"><Star className="h-5 w-5" /></div><div className="absolute bottom-4 left-4 right-4"><h3 className="font-black text-white">{title}</h3><p className="text-xs text-white/65">AI selected</p></div></div>)}</div></section></Page>; }

function CreateView() {
  const [task, setTask] = useState('Make a marketplace post from my red car photos. Use outside and interior pictures, write a clear description, and make it ready to post.');
  const [status, setStatus] = useState('ready');
  const [savedDrafts, setSavedDrafts] = useState([]);
  const [selectedIdea, setSelectedIdea] = useState('marketplace');
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState('Not tested yet');
  const ideas = [
    { id: 'marketplace', label: 'Marketplace post', text: 'Make a marketplace post from my red car photos. Use outside and interior pictures, write a clear description, and make it ready to post.' },
    { id: 'birthday', label: 'Birthday reel', text: 'Find the best birthday photos for Emma and create a short reel idea with caption and hashtags.' },
    { id: 'festival', label: 'Festival post', text: 'Create a warm family festival post from my recent pictures with a short caption and collage idea.' },
  ];
  const fallback = {
    title: 'Red Car for Sale — Clean Interior + Exterior',
    summary: 'SnapNext selected the best outside and inside shots, organized them for marketplace, and prepared this listing for final review.',
    caption: 'Well-kept red car with clean exterior, neat interior, and ready-to-share photo set. Message me for details.',
    hashtags: ['#marketplace', '#carforsale', '#readytopost'],
    steps: ['Photos found', 'Draft ready', 'Review and post'],
    draftType: 'Marketplace',
  };
  const runTask = async () => {
    setStatus('working');
    setError('');
    setLastRun('Calling backend route…');
    try {
      const response = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'AI request failed.');
      }
      setAiResult(data.result || fallback);
      setLastRun('Gemini connected successfully');
    } catch (err) {
      setError(err.message || 'Unexpected AI error.');
      setLastRun('Backend returned an error');
      setAiResult(null);
    } finally {
      setStatus('ready');
    }
  };
  const saveDraft = () => {
    const result = aiResult || fallback;
    setSavedDrafts((drafts) => [{ title: result.title, type: result.draftType || 'Ready to review', time: 'Just now' }, ...drafts]);
  };
  const chooseIdea = (idea) => { setSelectedIdea(idea.id); setTask(idea.text); setError(''); };
  const result = aiResult || fallback;
  return <Page><div><p className="text-sm font-bold text-pink-300">AI Agent</p><h1 className="text-3xl font-black text-white">Ask SnapNext to do it</h1><p className="mt-2 text-sm text-white/50">Live Gemini test build. Tap Run to verify the backend key and generate a real AI draft.</p></div><section className="rounded-[30px] border border-pink-400/20 bg-gradient-to-br from-pink-500/15 to-purple-700/15 p-4"><div className="mb-3 flex gap-2 overflow-x-auto pb-1">{ideas.map((idea) => <button key={idea.id} onClick={() => chooseIdea(idea)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black ${selectedIdea === idea.id ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>{idea.label}</button>)}</div><textarea value={task} onChange={(e) => setTask(e.target.value)} className="min-h-[145px] w-full resize-none rounded-[24px] border border-white/10 bg-black/25 p-4 text-sm font-semibold leading-6 text-white outline-none" /><button onClick={runTask} disabled={status === 'working'} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-70"><Send className="h-4 w-4" /> {status === 'working' ? 'Calling Gemini…' : 'Run Gemini AI Task'}</button><div className={`mt-3 rounded-2xl border p-3 text-xs font-black ${lastRun === 'Gemini connected successfully' ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : error ? 'border-amber-400/20 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-white/10 text-white/60'}`}>{error ? <span className="flex gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</span> : lastRun}</div></section><section className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4"><Title title="Agent task flow" sub={aiResult ? 'Gemini result → review → save draft' : 'Preview shown until Gemini returns a live result'} /><div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black">{(result.steps || fallback.steps).slice(0,3).map((step, index) => <div key={step} className={`rounded-2xl p-3 ${index === 0 ? 'bg-emerald-500/15 text-emerald-200' : index === 1 ? 'bg-pink-500/15 text-pink-200' : 'bg-white/10 text-white/70'}`}>{index + 1}. {step}</div>)}</div><div className="my-4 grid grid-cols-3 gap-2"><div className="aspect-square rounded-2xl bg-gradient-to-br from-red-500 to-black" /><div className="aspect-square rounded-2xl bg-gradient-to-br from-zinc-700 to-black" /><div className="aspect-square rounded-2xl bg-gradient-to-br from-red-700 to-zinc-900" /></div><div className="rounded-[24px] border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-widest text-pink-300">{aiResult ? 'Gemini generated draft' : 'Preview draft'}</p><h3 className="mt-2 text-xl font-black text-white">{result.title}</h3><p className="mt-2 text-sm leading-6 text-white/70">{result.summary}</p><p className="mt-3 rounded-2xl bg-white/10 p-3 text-sm leading-6 text-white/80">{result.caption}</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">{(result.hashtags || fallback.hashtags).map((tag) => <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-white/70">{tag}</span>)}</div></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={saveDraft} className="rounded-full bg-white px-4 py-3 text-xs font-black text-black">Save Draft</button><button className="rounded-full bg-white/10 px-4 py-3 text-xs font-black text-white">Change Photos</button></div></section>{savedDrafts.length > 0 && <section className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-4"><Title title="Saved drafts" sub="Ready for review before posting" />{savedDrafts.map((draft, i) => <div key={`${draft.title}-${i}`} className="mb-2 flex items-center gap-3 rounded-3xl bg-white/10 p-3"><CheckCircle2 className="h-6 w-6 text-emerald-300" /><div className="flex-1"><div className="font-black text-white">{draft.title}</div><div className="text-xs text-white/50">{draft.type} · {draft.time}</div></div></div>)}</section>}<div className="grid grid-cols-2 gap-3"><Quick icon={ImagePlus} title="Daily Post" sub="Best photo + caption" /><Quick icon={Play} title="Reel" sub="Short video idea" /><Quick icon={Layers} title="Collage" sub="Occasion ready" /><Quick icon={Share2} title="Social Update" sub="One feed summary" /></div></Page>;
}

function PeopleView() { return <Page><div><p className="text-sm font-bold text-pink-300">People</p><h1 className="text-3xl font-black text-white">Your private memory circle</h1></div><button className="flex w-full items-center justify-center gap-2 rounded-3xl bg-white px-4 py-3 text-sm font-black text-black"><Users className="h-4 w-4" /> Invite favorite contact</button>{people.map((p) => <div key={p.name} className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4"><div className="flex items-center gap-4"><div className={`grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br ${p.color} text-2xl`}>{p.emoji}</div><div className="flex-1"><div className="text-lg font-black text-white">{p.name}</div><div className="text-sm text-white/45">{p.relation} · {p.count} memories</div></div><ChevronRight className="h-5 w-5 text-white/35" /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-white/[0.06] p-3"><Images className="mx-auto h-4 w-4 text-pink-300"/><div className="mt-1 text-[11px] font-bold text-white/60">Photos</div></div><div className="rounded-2xl bg-white/[0.06] p-3"><ShieldCheck className="mx-auto h-4 w-4 text-emerald-300"/><div className="mt-1 text-[11px] font-bold text-white/60">Permission</div></div><div className="rounded-2xl bg-white/[0.06] p-3"><MessageCircle className="mx-auto h-4 w-4 text-indigo-300"/><div className="mt-1 text-[11px] font-bold text-white/60">Chat</div></div></div></div>)}<section><Title title="Community Albums" sub="Shared albums with chat and AI stories" /><div className="space-y-3">{communities.map((c) => <div key={c.name} className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4"><div className={`mb-4 h-24 rounded-[24px] bg-gradient-to-br ${c.color} p-4`}><div className="rounded-full bg-white/18 px-3 py-1 text-[11px] font-black text-white w-fit">{c.members} members</div></div><h3 className="font-black text-white">{c.name}</h3><p className="text-xs text-white/50">{c.memories} memories · {c.last}</p></div>)}</div></section></Page>; }

function ProfileView() { return <Page><div><p className="text-sm font-bold text-pink-300">Profile</p><h1 className="text-3xl font-black text-white">Vipin’s SnapNext</h1><p className="mt-2 text-sm text-white/50">Sync, settings, connected accounts, storage, security, and plan.</p></div><div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-5"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-pink-500 to-purple-700 font-black">VL</div><div><h2 className="text-xl font-black text-white">Super User</h2><p className="text-sm text-white/50">Unlimited storage · Family access active</p></div></div></div><Title title="Sync & Connected Sources" sub="Phone, clouds, and social accounts live here" /><div className="grid grid-cols-2 gap-3">{syncSources.map((s) => <SourceCard key={s.name} s={s} />)}</div><div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-5"><div className="flex gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-300" /><p className="text-sm text-white/70">SnapNext syncs only after user authorization and confirmation.</p></div></div></Page>; }

function FloatingNav({ tab, setTab }) { const items = [{ id: 'home', icon: Home },{ id: 'gallery', icon: Images },{ id: 'create', icon: Sparkles, center: true, dot: true },{ id: 'people', icon: Users, dot: true },{ id: 'profile', icon: UserCircle, dot: true }]; return <nav className="fixed bottom-[calc(env(safe-area-inset-bottom)+48px)] left-0 right-0 z-50 flex justify-center px-4"><div className="flex w-[calc(100%-32px)] max-w-[380px] items-center justify-between rounded-full border border-white/40 bg-white/85 p-2 shadow-2xl backdrop-blur-xl">{items.map((item) => { const Icon = item.icon; const selected = tab === item.id; return <button key={item.id} onClick={() => setTab(item.id)} className={`relative grid place-items-center transition active:scale-95 ${selected && !item.center ? 'h-14 w-24 rounded-full bg-black/10 text-black' : 'h-14 w-14 rounded-full text-black'} ${item.center ? 'h-16 w-16 -translate-y-2 bg-gradient-to-br from-pink-500 to-purple-700 text-white shadow-xl' : ''}`}><Icon className="h-7 w-7" />{item.dot && !selected && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}</button>; })}</div></nav>; }

export default function SnapNextV3Page() { 
  const [tab, setTab] = useState('home'); 
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  return <div className="bg-[#07020f] text-white"><div className="pointer-events-none fixed inset-0 opacity-80"><div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-fuchsia-600/25 blur-3xl" /><div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" /></div><header className="sticky top-0 z-30 border-b border-white/5 bg-[#07020f]/90 px-4 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-5xl items-center justify-between"><div className="flex items-center gap-3"><BrandLogo size={40} priority /><div><div className="font-black">SnapNext Evolution</div><div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Digital Life Sync</div></div></div>
  
  <div className="flex items-center gap-3">
    {user ? (
      <>
        <Link href="/dashboard" className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-[11px] font-black uppercase tracking-wider hover:brightness-110 transition shadow-lg shadow-pink-500/20">Dashboard</Link>
        <Link href="/dashboard?tab=upload" className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-wider hover:bg-white/10 transition">Upload</Link>
      </>
    ) : (
      <>
        <Link href="/login" className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-[11px] font-black uppercase tracking-wider hover:brightness-110 transition shadow-lg shadow-pink-500/20">Login</Link>
        <Link href="/signup" className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-wider hover:bg-white/10 transition">Sign Up</Link>
      </>
    )}
    <Bell className="h-5 w-5 text-white/50" />
    <button onClick={() => setTab('profile')} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-xs font-black">
      {user ? user.name?.slice(0, 2).toUpperCase() : 'VL'}
    </button>
  </div>
  
  </div></header><main className="relative z-10 mx-auto max-w-5xl px-4 pb-[calc(128px+env(safe-area-inset-bottom))] pt-5">{tab === 'home' && <HomeView setTab={setTab} user={user} />}{tab === 'gallery' && <GalleryView />}{tab === 'create' && <CreateView />}{tab === 'people' && <PeopleView />}{tab === 'profile' && <ProfileView />}</main><FloatingNav tab={tab} setTab={setTab} /></div>; 
}
