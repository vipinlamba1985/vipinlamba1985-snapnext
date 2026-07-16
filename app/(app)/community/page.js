'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { Check, ImagePlus, Loader2, MessageCircle, Plus, Send, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';

function title(thread) {
  if (thread.type === 'community') return thread.name;
  return thread.members?.map(member => member.name).filter(Boolean).join(' & ') || 'Private chat';
}

export default function Community() {
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState('direct');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showMemories, setShowMemories] = useState(false);
  const [memoryOptions, setMemoryOptions] = useState([]);
  const [selectedMemories, setSelectedMemories] = useState([]);
  const endRef = useRef(null);

  async function loadThreads(selectFirst = false) {
    const data = await apiFetch('/social-chat/threads');
    setThreads(data.threads || []);
    if (selectFirst && !activeId && data.threads?.[0]) setActiveId(data.threads[0].id);
  }

  async function loadThread(id, quiet = false) {
    if (!id) return;
    try {
      const data = await apiFetch(`/social-chat/threads/${id}`);
      setActiveThread(data.thread);
      setMessages(data.messages || []);
    } catch (error) {
      if (!quiet) toast.error(error.message || 'We could not open this conversation.');
    }
  }

  async function openMemoryPicker() {
    try {
      const data = await apiFetch('/media?filter=all');
      setMemoryOptions((data.items || []).filter(item => ['photo', 'video'].includes(item.kind)).slice(0, 100));
      setShowMemories(true);
    } catch (error) { toast.error(error.message || 'We could not open your memories.'); }
  }

  useEffect(() => {
    (async () => {
      try { await loadThreads(true); } catch (error) { toast.error(error.message || 'We could not load chats.'); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
    setSelectedMemories([]);
    const timer = setInterval(() => loadThread(activeId, true), 5000);
    return () => clearInterval(timer);
  }, [activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const personal = useMemo(() => threads.filter(thread => thread.type === 'direct'), [threads]);
  const communities = useMemo(() => threads.filter(thread => thread.type === 'community'), [threads]);

  async function createThread() {
    try {
      const data = await apiFetch('/social-chat/threads', { method: 'POST', body: JSON.stringify({ type: createType, email, name }) });
      setShowCreate(false); setEmail(''); setName('');
      await loadThreads(); setActiveId(data.thread.id);
      toast.success(data.existing ? 'Existing conversation opened.' : createType === 'community' ? 'Memory community created.' : 'Private chat created.');
    } catch (error) { toast.error(error.message || 'We could not create this chat.'); }
  }

  async function send() {
    const message = content.trim();
    if ((!message && !selectedMemories.length) || !activeId || sending) return;
    setSending(true); setContent('');
    const memoryIds = [...selectedMemories];
    setSelectedMemories([]);
    try {
      const data = await apiFetch(`/social-chat/threads/${activeId}/messages`, { method: 'POST', body: JSON.stringify({ content: message, memoryIds }) });
      setMessages(current => [...current, data.message]);
      await loadThreads();
    } catch (error) {
      setContent(message); setSelectedMemories(memoryIds); toast.error(error.message || 'Message not sent.');
    } finally { setSending(false); }
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    try {
      await apiFetch(`/social-chat/threads/${activeId}/members`, { method: 'POST', body: JSON.stringify({ email: inviteEmail }) });
      setInviteEmail(''); await loadThread(activeId); toast.success('Member added to the community.');
    } catch (error) { toast.error(error.message || 'Invitation failed.'); }
  }

  function toggleMemory(id) {
    setSelectedMemories(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 10 ? current : [...current, id]);
  }

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/50" /></div>;

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black">Memory Communities</h1><p className="mt-2 max-w-2xl text-sm text-white/55">Create a private space for a trip, family event, celebration, or shared chapter. Share the memories, then discuss them together. Personal chats remain available for one-to-one conversations.</p></div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black"><Plus className="h-4 w-4" /> New chat or community</button>
      </header>

      <div className="grid min-h-[68vh] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] lg:grid-cols-[20rem_1fr]">
        <aside className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-emerald-200"><ShieldCheck className="h-4 w-4" /> Private by default</div>
          <Section label="Personal chats" icon={<MessageCircle className="h-4 w-4" />} items={personal} activeId={activeId} onSelect={setActiveId} />
          <div className="mt-5"><Section label="Memory communities" icon={<Users className="h-4 w-4" />} items={communities} activeId={activeId} onSelect={setActiveId} /></div>
          {!threads.length && <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-white/45">Start a private chat or create a community around shared memories.</div>}
        </aside>

        <main className="flex min-h-[34rem] flex-col">
          {activeThread ? <>
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">{title(activeThread)}</h2><p className="mt-1 text-xs text-white/45">{activeThread.type === 'community' ? `${activeThread.memberIds?.length || 1} members · share and discuss travel or life memories` : 'One-to-one private conversation with a friend, family member, or favourite person'}</p></div></div>
              {activeThread.type === 'community' && <div className="mt-3 flex max-w-md gap-2"><input value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="Invite friend or family by email" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /><button onClick={invite} className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold"><UserPlus className="h-4 w-4" /> Add</button></div>}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">{messages.map(message => <div key={message.id} className="max-w-[92%] rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-[11px] font-bold text-pink-200">{message.sender?.name || 'Member'}</div>{message.memories?.length > 0 && <div className="mt-2 grid gap-2 sm:grid-cols-2">{message.memories.map(memory => <div key={memory.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="aspect-video bg-black">{memory.kind === 'video' ? <video src={mediaSrc(memory.id)} className="h-full w-full object-cover" controls /> : <img src={mediaSrc(memory.id)} alt={memory.name || 'Shared memory'} className="h-full w-full object-cover" />}</div><div className="p-3"><div className="truncate text-xs font-black">{memory.name || 'Shared memory'}</div>{(memory.caption || memory.album) && <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/45">{memory.caption || memory.album}</div>}<div className="mt-2 text-[10px] font-bold text-cyan-200">Discuss this memory below</div></div></div>)}</div>}{message.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/85">{message.content}</p>}<div className="mt-1 text-[10px] text-white/30">{new Date(message.createdAt).toLocaleString()}</div></div>)}{!messages.length && <div className="grid h-full place-items-center text-center text-sm text-white/40"><div><ImagePlus className="mx-auto mb-3 h-8 w-8 text-purple-300" />Share the first travel or life memory and start the discussion.</div></div>}<div ref={endRef} /></div>
            {selectedMemories.length > 0 && <div className="border-t border-white/10 px-4 py-3"><div className="flex flex-wrap gap-2">{selectedMemories.map(id => { const memory = memoryOptions.find(item => item.id === id); return <div key={id} className="flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1.5 text-xs"><span className="max-w-40 truncate">{memory?.name || 'Memory selected'}</span><button onClick={() => toggleMemory(id)}><X className="h-3.5 w-3.5" /></button></div>; })}</div></div>}
            <div className="flex gap-2 border-t border-white/10 p-4"><button onClick={openMemoryPicker} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5" title="Share memories"><ImagePlus className="h-4 w-4" /></button><input value={content} onChange={event => setContent(event.target.value)} onKeyDown={event => event.key === 'Enter' && !event.shiftKey && send()} maxLength={2000} placeholder={selectedMemories.length ? 'Add context or ask everyone about these memories…' : 'Write a message or share a memory…'} className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-pink-400/50" /><button onClick={send} disabled={(!content.trim() && !selectedMemories.length) || sending} className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-500 disabled:opacity-35">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
          </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><Users className="mx-auto h-10 w-10 text-purple-300" /><h2 className="mt-3 text-xl font-black">Choose a conversation</h2><p className="mt-2 text-sm text-white/45">Your personal chats and memory communities will appear here.</p></div></div>}
        </main>
      </div>

      {showCreate && <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4" onClick={() => setShowCreate(false)}><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#150b20] p-5" onClick={event => event.stopPropagation()}><div className="flex justify-between"><div><h2 className="text-xl font-black">Start something private</h2><p className="mt-1 text-sm text-white/45">Any SnapNext user can create a community and invite friends or family.</p></div><button onClick={() => setShowCreate(false)}><X className="h-5 w-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => setCreateType('direct')} className={`rounded-2xl p-3 text-sm font-bold ${createType === 'direct' ? 'bg-pink-500' : 'bg-white/5'}`}>Personal chat</button><button onClick={() => setCreateType('community')} className={`rounded-2xl p-3 text-sm font-bold ${createType === 'community' ? 'bg-purple-500' : 'bg-white/5'}`}>Memory community</button></div>{createType === 'direct' ? <input value={email} onChange={event => setEmail(event.target.value)} placeholder="Friend or family member email" className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" /> : <><input value={name} onChange={event => setName(event.target.value)} placeholder="Example: Québec Summer Trip 2026" maxLength={80} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" /><p className="mt-2 text-xs leading-5 text-white/40">Use communities for trips, birthdays, weddings, family history, events, or any shared memory collection.</p></>}<button onClick={createThread} className="mt-4 w-full rounded-full bg-white px-5 py-3 text-sm font-black text-black">Create</button></div></div>}

      {showMemories && <div className="fixed inset-0 z-[95] grid place-items-center bg-black/80 p-4" onClick={() => setShowMemories(false)}><div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#150b20]" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b border-white/10 p-5"><div><h2 className="text-xl font-black">Share memories</h2><p className="mt-1 text-sm text-white/45">Choose up to 10 photos or videos from your own SnapNext gallery.</p></div><button onClick={() => setShowMemories(false)}><X className="h-5 w-5" /></button></div><div className="grid max-h-[62vh] grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-5">{memoryOptions.map(memory => { const active = selectedMemories.includes(memory.id); return <button key={memory.id} onClick={() => toggleMemory(memory.id)} className={`relative aspect-square overflow-hidden rounded-xl border ${active ? 'border-cyan-300 ring-2 ring-cyan-300/40' : 'border-white/10'}`}>{memory.kind === 'video' ? <video src={mediaSrc(memory.id)} className="h-full w-full object-cover" muted /> : <img src={mediaSrc(memory.id)} alt="" className="h-full w-full object-cover" />}{active && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-cyan-400 text-black"><Check className="h-4 w-4" /></span>}</button>; })}</div><div className="flex items-center justify-between border-t border-white/10 p-4"><span className="text-sm text-white/50">{selectedMemories.length} selected</span><button onClick={() => setShowMemories(false)} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">Add to conversation</button></div></div></div>}
    </div>
  );
}

function Section({ label, icon, items, activeId, onSelect }) {
  return <div><div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white/40">{icon}{label}</div><div className="space-y-1">{items.map(thread => <button key={thread.id} onClick={() => onSelect(thread.id)} className={`w-full rounded-2xl p-3 text-left ${activeId === thread.id ? 'bg-white/10' : 'hover:bg-white/5'}`}><div className="truncate text-sm font-bold">{title(thread)}</div><div className="mt-1 truncate text-xs text-white/35">{thread.lastMessage || (thread.type === 'community' ? 'Share memories and discuss together' : 'New private conversation')}</div></button>)}</div></div>;
}
