'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { Bot, Image as ImageIcon, Loader2, Mic, MicOff, Play, Send, Sparkles, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const STARTERS = [
  'Show my latest pics',
  'Show my beach photos',
  'Find my favorite memories',
  'What did I save last month?',
];

function wantsMedia(query) {
  return /\b(show|find|latest|recent|photo|photos|picture|pictures|pics|pic|video|videos|gallery|favorite|favourite|beach|trip|birthday|wedding)\b/i.test(query || '');
}

function wantsLastMonth(query) {
  return /\b(last month|past month|previous month)\b/i.test(query || '');
}

function queryTerms(query) {
  const stop = new Set(['show','find','my','me','the','a','an','photos','photo','pictures','picture','pics','pic','videos','video','latest','recent','saved','memories','memory','with','from','and','or','please']);
  return String(query || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !stop.has(word));
}

function searchableText(media) {
  return [
    media.name,
    media.kind,
    media.aiAnalysis?.autoAlbum,
    media.aiAnalysis?.description,
    ...(media.aiAnalysis?.tags || []),
    ...(media.aiAnalysis?.locations || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function previousMonthRange() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
}

function filterMedia(items, query) {
  const q = String(query || '').toLowerCase();
  let matches = [...items];
  if (/\b(photo|photos|picture|pictures|pics|pic)\b/i.test(q)) matches = matches.filter((m) => m.kind === 'photo');
  if (/\b(video|videos)\b/i.test(q)) matches = matches.filter((m) => m.kind === 'video');
  if (/\bfavorite|favourite|loved\b/i.test(q)) matches = matches.filter((m) => m.favorite || m.isFavorite);

  if (wantsLastMonth(q)) {
    const { start, end } = previousMonthRange();
    matches = matches.filter((m) => {
      const d = new Date(m.createdAt);
      return d >= start && d < end;
    });
  }

  const terms = queryTerms(q);
  if (!/\b(latest|recent|newest|last month|past month|previous month)\b/i.test(q) && terms.length) {
    matches = matches.filter((m) => terms.every((term) => searchableText(m).includes(term)));
  }
  return matches.slice(0, 12);
}

export default function ChatPage() {
  const [messages, setMessages] = useState([{ id: 'welcome', role: 'assistant', text: 'Hello! I am SnapNext AI. I can help you search, organize, and understand the photos and videos you have saved — always grounded in your real library.\n\nTry: “Show my latest pics”, “Find my favorite memories”, or “What did I save last month?”', createdAt: new Date() }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => sendMessage(e.results[0][0].transcript);
    rec.onerror = () => { setIsRecording(false); toast.error('Voice input error. Try again.'); };
    rec.onend = () => setIsRecording(false);
    recognitionRef.current = rec;
  }, []);

  function toggleRecording() {
    if (!recognitionRef.current) return toast.error('Voice input is not supported in this browser.');
    if (isRecording) recognitionRef.current.stop();
    else { setIsRecording(true); recognitionRef.current.start(); }
  }

  async function directMediaAnswer(queryText) {
    const res = await apiFetch('/media');
    const items = (res.items || res.media || res.data || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const matches = filterMedia(items, queryText);
    if (!matches.length) {
      return { text: 'I could not find matching memories in your saved library yet. Try another word, or upload more photos and videos for SnapNext to search.', matchedMedia: [] };
    }
    if (wantsLastMonth(queryText)) {
      const { start } = previousMonthRange();
      const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const photos = matches.filter((m) => m.kind === 'photo').length;
      const videos = matches.filter((m) => m.kind === 'video').length;
      return { text: `In ${label}, I found ${matches.length} saved ${matches.length === 1 ? 'memory' : 'memories'} — ${photos} photos and ${videos} videos.`, matchedMedia: matches };
    }
    return { text: `I found ${matches.length} matching ${matches.length === 1 ? 'memory' : 'memories'} from your real library.`, matchedMedia: matches };
  }

  async function sendMessage(textToSend) {
    const queryText = (textToSend || input).trim();
    if (!queryText) return;
    if (!textToSend) setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, { id: crypto.randomUUID?.() || String(Math.random()), role: 'user', text: queryText, createdAt: new Date() }]);

    try {
      if (wantsMedia(queryText) || wantsLastMonth(queryText)) {
        const answer = await directMediaAnswer(queryText);
        setMessages((prev) => [...prev, { id: crypto.randomUUID?.() || String(Math.random()), role: 'assistant', text: answer.text, matchedMedia: answer.matchedMedia, createdAt: new Date() }]);
        return;
      }

      const res = await apiFetch('/ai/chat', { method: 'POST', body: JSON.stringify({ query: queryText, voiceResponse: false }) });
      setMessages((prev) => [...prev, { id: crypto.randomUUID?.() || String(Math.random()), role: 'assistant', text: res.reply || 'I can help, but I need a little more detail.', matchedMedia: [], createdAt: new Date() }]);
    } catch (e) {
      if (/prompt is too long/i.test(e.message || '')) {
        const answer = await directMediaAnswer(queryText);
        setMessages((prev) => [...prev, { id: crypto.randomUUID?.() || String(Math.random()), role: 'assistant', text: answer.text || 'Your library is large. Try a more specific search.', matchedMedia: answer.matchedMedia || [], createdAt: new Date() }]);
      } else {
        toast.error(e.message || 'An AI error occurred.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden" id="chat-container">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/20"><Sparkles className="h-5 w-5 text-white" /></div>
          <div><h1 className="text-md font-semibold text-white">SnapNext AI</h1><p className="text-xs text-white/50">Grounded in your saved memories</p></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <div className="h-9 w-9 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center justify-center shrink-0"><Bot className="h-4.5 w-4.5 text-purple-300" /></div>}
              <div className={`space-y-3 max-w-[78%] ${m.role === 'user' ? 'order-1' : 'order-2'}`}>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-tr-none shadow-md' : 'bg-white/[0.04] border border-white/10 text-white/90 rounded-tl-none'}`}><p className="whitespace-pre-wrap">{m.text}</p></div>
                {m.matchedMedia?.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5 shadow-lg">
                    <div className="text-xs text-white/60 font-semibold uppercase tracking-wider flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5 text-pink-300" /> Matches Found ({m.matchedMedia.length})</div>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {m.matchedMedia.map((media) => (
                        <div key={media.id} className="relative aspect-square rounded-xl overflow-hidden group bg-white/5 border border-white/10">
                          {media.kind === 'photo' ? <img src={mediaSrc(media.id)} alt={media.name || 'Memory'} className="h-full w-full object-cover group-hover:scale-105 transition duration-300" /> : <video src={mediaSrc(media.id)} className="h-full w-full object-cover" muted />}
                          {media.kind === 'video' && <div className="absolute inset-0 bg-black/35 flex items-center justify-center"><Play className="h-5 w-5 text-white fill-white" /></div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {m.role === 'user' && <div className="h-9 w-9 rounded-full bg-pink-950/80 border border-pink-500/30 flex items-center justify-center shrink-0 order-3"><User className="h-4.5 w-4.5 text-pink-300" /></div>}
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && <div className="flex gap-4 justify-start"><div className="h-9 w-9 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center justify-center shrink-0"><Bot className="h-4.5 w-4.5 text-purple-300" /></div><div className="bg-white/[0.02] border border-white/15 px-4 py-3 rounded-2xl text-sm text-white/60 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching memories...</div></div>}
        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && <div className="px-6 py-3 bg-white/[0.01] border-t border-white/5 flex gap-2 overflow-x-auto select-none no-scrollbar">{STARTERS.map((item) => <button key={item} onClick={() => sendMessage(item)} className="text-xs bg-white/5 border border-white/10 hover:border-pink-500/30 hover:bg-pink-500/5 px-3 py-1.5 rounded-full text-white/80 shrink-0 transition">{item}</button>)}</div>}

      <div className="p-4 border-t border-white/10 bg-white/[0.01] flex items-center gap-3">
        <button onClick={toggleRecording} className={`p-3.5 rounded-full transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10'}`} title={isRecording ? 'Stop Recording' : 'Speak'}>{isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button>
        <div className="flex-1 relative flex items-center">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={isRecording ? 'Listening...' : 'Ask SnapNext AI...'} disabled={isRecording} className="w-full bg-white/5 border border-white/10 focus:border-pink-500/50 rounded-2xl pl-4 pr-12 py-3.5 text-sm outline-none text-white transition placeholder-white/40" />
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading} className="absolute right-2.5 p-2 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-30 disabled:hover:bg-pink-500 transition text-white"><Send className="h-4.5 w-4.5" /></button>
        </div>
      </div>
    </div>
  );
}
