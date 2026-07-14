'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { Bot, Brain, Image as ImageIcon, Loader2, Mic, MicOff, Play, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, User, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const STARTERS = ['Show my latest photos','Find my beach memories','What did I save last month?','Summarize my favorite memories'];
function messageId() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function formatDate(value) { if (!value) return ''; try { return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } }

export default function ChatPage() {
  const [messages, setMessages] = useState([{ id: 'welcome', role: 'assistant', text: 'Hello — I am LifeGPT, the private AI that understands your SnapNext memories. I answer from your saved photos, videos, dates, people, places, OCR, and existing AI intelligence. I will not invent facts about your life.', matches: [], grounded: true, usedAi: false, note: 'Searching existing indexed memories uses 0 AI Credits.', createdAt: new Date() }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US';
    recognition.onresult = (event) => sendMessage(event.results[0][0].transcript);
    recognition.onerror = () => { setIsRecording(false); toast.error('Voice input error. Try again.'); };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
  }, []);

  function toggleRecording() {
    if (!recognitionRef.current) return toast.error('Voice input is not supported in this browser.');
    if (isRecording) recognitionRef.current.stop(); else { setIsRecording(true); recognitionRef.current.start(); }
  }

  async function sendFeedback(message, rating) {
    if (message.feedback) return;
    let correction = '';
    if (rating === 'incorrect') correction = window.prompt('What was incorrect? This will be recorded for review and will not automatically change your memories.') || '';
    try {
      await apiFetch('/lifegpt-feedback', { method: 'POST', body: JSON.stringify({ responseId: message.responseId || message.id, rating, query: message.query || '', correction, sourceIds: (message.matches || []).map((item) => item.id) }) });
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedback: rating } : item));
      toast.success(rating === 'helpful' ? 'Thanks for the feedback.' : 'Correction recorded for review.');
    } catch (error) { toast.error(error.message || 'Could not save feedback.'); }
  }

  async function sendMessage(textToSend) {
    const query = String(textToSend || input).trim();
    if (!query || loading) return;
    if (query.length > 1200) return toast.error('Please shorten your LifeGPT request to 1,200 characters or less.');
    if (!textToSend) setInput('');
    setLoading(true);
    setMessages((current) => [...current, { id: messageId(), role: 'user', text: query, createdAt: new Date() }]);
    try {
      const response = await apiFetch('/lifegpt', { method: 'POST', body: JSON.stringify({ query }) });
      setMessages((current) => [...current, { id: messageId(), responseId: response.responseId || messageId(), query, role: 'assistant', text: response.reply || 'I could not find enough grounded evidence for that request.', matches: response.matches || [], grounded: response.grounded !== false, usedAi: !!response.usedAi, creditsUsed: response.creditsUsed, note: response.note || null, aiDeferred: !!response.aiDeferred, suggestions: response.suggestions || [], createdAt: new Date() }]);
    } catch (error) {
      const message = error?.message || 'LifeGPT could not complete that request.';
      setMessages((current) => [...current, { id: messageId(), role: 'assistant', text: message, matches: [], grounded: true, usedAi: false, createdAt: new Date() }]);
      toast.error(message);
    } finally { setLoading(false); }
  }

  return (
    <div className="flex h-[calc(100dvh-11rem-env(safe-area-inset-bottom))] min-h-[32rem] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] md:h-[calc(100vh-120px)]" id="lifegpt-container">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-5 py-4 md:px-6">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 shadow-lg shadow-pink-500/20"><Brain className="h-5 w-5 text-white" /></div><div><div className="flex items-center gap-2"><h1 className="font-black text-white">LifeGPT</h1><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200">Grounded</span></div><p className="text-xs text-white/50">The AI that understands your life, not just your prompts</p></div></div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/55 sm:flex"><ShieldCheck className="h-3.5 w-3.5 text-emerald-200" /> Private library only</div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-8 md:p-6"><AnimatePresence initial={false}>{messages.map((message) => (
        <motion.div key={message.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 md:gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {message.role === 'assistant' && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-purple-500/30 bg-purple-950/80"><Bot className="h-4 w-4 text-purple-300" /></div>}
          <div className={`max-w-[84%] space-y-3 md:max-w-[78%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
            <div className={`rounded-2xl p-4 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-tr-none bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md' : 'rounded-tl-none border border-white/10 bg-white/[0.04] text-white/90'}`}><p className="whitespace-pre-wrap">{message.text}</p></div>
            {!!message.suggestions?.length && <div className="flex flex-wrap gap-2">{message.suggestions.map((suggestion) => <button key={suggestion} onClick={() => sendMessage(suggestion)} disabled={loading} className="min-h-10 rounded-full border border-pink-300/20 bg-pink-400/10 px-3 py-2 text-xs font-semibold text-pink-100">{suggestion}</button>)}</div>}
            {message.role === 'assistant' && <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider">{message.grounded && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-200"><ShieldCheck className="h-3 w-3" /> Grounded in sources</span>}{!message.usedAi && <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-200"><Zap className="h-3 w-3" /> 0 AI Credits</span>}{message.usedAi && <span className="inline-flex items-center gap-1 rounded-full border border-purple-400/20 bg-purple-400/10 px-2 py-1 text-purple-200"><Sparkles className="h-3 w-3" /> Narrative AI{Number.isFinite(message.creditsUsed) ? ` · ${message.creditsUsed} credits` : ''}</span>}</div>}
            {message.role === 'assistant' && message.id !== 'welcome' && <div className="flex items-center gap-2"><span className="text-[11px] text-white/35">Was this accurate?</span><button onClick={() => sendFeedback(message, 'helpful')} disabled={!!message.feedback} className={`rounded-full border p-2 ${message.feedback === 'helpful' ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-200' : 'border-white/10 text-white/45 hover:text-white'}`} title="Helpful"><ThumbsUp className="h-3.5 w-3.5" /></button><button onClick={() => sendFeedback(message, 'incorrect')} disabled={!!message.feedback} className={`rounded-full border p-2 ${message.feedback === 'incorrect' ? 'border-rose-300/40 bg-rose-300/15 text-rose-200' : 'border-white/10 text-white/45 hover:text-white'}`} title="Incorrect"><ThumbsDown className="h-3.5 w-3.5" /></button>{message.feedback && <span className="text-[11px] text-white/35">Feedback saved</span>}</div>}
            {message.note && <p className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-xs leading-5 text-white/45">{message.note}</p>}
            {message.matches?.length > 0 && <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-lg"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/60"><ImageIcon className="h-3.5 w-3.5 text-pink-300" /> Source memories</div><span className="text-[11px] text-white/35">{message.matches.length} verified matches</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{message.matches.map((memory, index) => <div key={memory.id} className="group overflow-hidden rounded-xl border border-white/10 bg-white/5"><div className="relative aspect-square overflow-hidden">{memory.kind === 'photo' ? <img src={mediaSrc(memory.id)} alt={memory.name || 'Memory'} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <video src={mediaSrc(memory.id)} className="h-full w-full object-cover" muted />}{memory.kind === 'video' && <div className="absolute inset-0 grid place-items-center bg-black/35"><Play className="h-5 w-5 fill-white text-white" /></div>}<span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white">[{index + 1}]</span></div><div className="space-y-1 p-2.5"><p className="truncate text-xs font-bold text-white/85">{memory.name || 'Saved memory'}</p><p className="text-[10px] text-white/40">{formatDate(memory.createdAt)}</p>{(memory.description || memory.album) && <p className="line-clamp-2 text-[10px] leading-4 text-white/45">{memory.description || memory.album}</p>}</div></div>)}</div></div>}
          </div>
          {message.role === 'user' && <div className="order-3 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-pink-500/30 bg-pink-950/80"><User className="h-4 w-4 text-pink-300" /></div>}
        </motion.div>))}</AnimatePresence>
        {loading && <div className="flex justify-start gap-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-purple-500/30 bg-purple-950/80"><Bot className="h-4 w-4 text-purple-300" /></div><div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.02] px-4 py-3 text-sm text-white/60"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching your private memory index…</div></div>}<div ref={messagesEndRef} />
      </div>
      {messages.length === 1 && <div className="no-scrollbar flex select-none gap-2 overflow-x-auto border-t border-white/5 bg-white/[0.01] px-4 py-3 md:px-6">{STARTERS.map((starter) => <button key={starter} onClick={() => sendMessage(starter)} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:border-pink-500/30 hover:bg-pink-500/5">{starter}</button>)}</div>}
      <div className="flex items-center gap-3 border-t border-white/10 bg-white/[0.01] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><button onClick={toggleRecording} className={`rounded-full p-3.5 transition-all ${isRecording ? 'animate-pulse bg-red-500 text-white shadow-lg shadow-red-500/30' : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}`} title={isRecording ? 'Stop recording' : 'Speak'}>{isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button><div className="relative flex flex-1 items-center"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendMessage()} placeholder={isRecording ? 'Listening…' : 'Ask LifeGPT about your memories…'} disabled={isRecording || loading} maxLength={1200} className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-4 pr-12 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-pink-500/50" /><button onClick={() => sendMessage()} disabled={!input.trim() || loading} className="absolute right-2.5 grid h-10 w-10 place-items-center rounded-xl bg-pink-500 text-white transition hover:bg-pink-600 disabled:opacity-30"><Send className="h-4 w-4" /></button></div></div>
    </div>
  );
}
