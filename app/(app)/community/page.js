'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Loader2, MessageCircle, Plus, Send, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
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

  useEffect(() => {
    (async () => {
      try { await loadThreads(true); } catch (error) { toast.error(error.message || 'We could not load chats.'); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
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
      toast.success(data.existing ? 'Existing conversation opened.' : createType === 'community' ? 'Private community created.' : 'Private chat created.');
    } catch (error) { toast.error(error.message || 'We could not create this chat.'); }
  }

  async function send() {
    const message = content.trim();
    if (!message || !activeId || sending) return;
    setSending(true); setContent('');
    try {
      const data = await apiFetch(`/social-chat/threads/${activeId}/messages`, { method: 'POST', body: JSON.stringify({ content: message }) });
      setMessages(current => [...current, data.message]);
      await loadThreads();
    } catch (error) { setContent(message); toast.error(error.message || 'Message not sent.'); }
    finally { setSending(false); }
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    try {
      await apiFetch(`/social-chat/threads/${activeId}/members`, { method: 'POST', body: JSON.stringify({ email: inviteEmail }) });
      setInviteEmail(''); await loadThread(activeId); toast.success('Member added to the community.');
    } catch (error) { toast.error(error.message || 'Invitation failed.'); }
  }

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/50" /></div>;

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black">Chats & Communities</h1><p className="mt-2 max-w-2xl text-sm text-white/55">Private conversations and invitation-only groups for sharing memories with people you choose.</p></div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black"><Plus className="h-4 w-4" /> New chat</button>
      </header>

      <div className="grid min-h-[68vh] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] lg:grid-cols-[20rem_1fr]">
        <aside className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-emerald-200"><ShieldCheck className="h-4 w-4" /> Private by default</div>
          <Section label="Personal chats" icon={<MessageCircle className="h-4 w-4" />} items={personal} activeId={activeId} onSelect={setActiveId} />
          <div className="mt-5"><Section label="Communities" icon={<Users className="h-4 w-4" />} items={communities} activeId={activeId} onSelect={setActiveId} /></div>
          {!threads.length && <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-white/45">Start a private chat or create a community.</div>}
        </aside>

        <main className="flex min-h-[34rem] flex-col">
          {activeThread ? <>
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">{title(activeThread)}</h2><p className="mt-1 text-xs text-white/45">{activeThread.type === 'community' ? `${activeThread.memberIds?.length || 1} members · invitation only` : 'One-to-one private conversation'}</p></div></div>
              {activeThread.type === 'community' && <div className="mt-3 flex max-w-md gap-2"><input value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="Invite by exact email" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /><button onClick={invite} className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold"><UserPlus className="h-4 w-4" /> Add</button></div>}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">{messages.map(message => <div key={message.id} className="max-w-[85%] rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-[11px] font-bold text-pink-200">{message.sender?.name || 'Member'}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-white/85">{message.content}</p><div className="mt-1 text-[10px] text-white/30">{new Date(message.createdAt).toLocaleString()}</div></div>)}{!messages.length && <div className="grid h-full place-items-center text-sm text-white/40">No messages yet. Start the conversation.</div>}<div ref={endRef} /></div>
            <div className="flex gap-2 border-t border-white/10 p-4"><input value={content} onChange={event => setContent(event.target.value)} onKeyDown={event => event.key === 'Enter' && !event.shiftKey && send()} maxLength={2000} placeholder="Write a message…" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-pink-400/50" /><button onClick={send} disabled={!content.trim() || sending} className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-500 disabled:opacity-35">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
          </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><Users className="mx-auto h-10 w-10 text-purple-300" /><h2 className="mt-3 text-xl font-black">Choose a conversation</h2><p className="mt-2 text-sm text-white/45">Your private chats and communities will appear here.</p></div></div>}
        </main>
      </div>

      {showCreate && <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4" onClick={() => setShowCreate(false)}><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#150b20] p-5" onClick={event => event.stopPropagation()}><div className="flex justify-between"><div><h2 className="text-xl font-black">Start something private</h2><p className="mt-1 text-sm text-white/45">Only invited SnapNext members can participate.</p></div><button onClick={() => setShowCreate(false)}><X className="h-5 w-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => setCreateType('direct')} className={`rounded-2xl p-3 text-sm font-bold ${createType === 'direct' ? 'bg-pink-500' : 'bg-white/5'}`}>Personal chat</button><button onClick={() => setCreateType('community')} className={`rounded-2xl p-3 text-sm font-bold ${createType === 'community' ? 'bg-purple-500' : 'bg-white/5'}`}>Community</button></div>{createType === 'direct' ? <input value={email} onChange={event => setEmail(event.target.value)} placeholder="Member email" className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" /> : <input value={name} onChange={event => setName(event.target.value)} placeholder="Community name" maxLength={80} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" />}<button onClick={createThread} className="mt-4 w-full rounded-full bg-white px-5 py-3 text-sm font-black text-black">Create</button></div></div>}
    </div>
  );
}

function Section({ label, icon, items, activeId, onSelect }) {
  return <div><div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white/40">{icon}{label}</div><div className="space-y-1">{items.map(thread => <button key={thread.id} onClick={() => onSelect(thread.id)} className={`w-full rounded-2xl p-3 text-left ${activeId === thread.id ? 'bg-white/10' : 'hover:bg-white/5'}`}><div className="truncate text-sm font-bold">{title(thread)}</div><div className="mt-1 truncate text-xs text-white/35">{thread.lastMessage || (thread.type === 'community' ? 'Private community' : 'New conversation')}</div></button>)}</div></div>;
}
