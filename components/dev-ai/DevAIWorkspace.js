'use client';

import { useMemo, useState } from 'react';
import { Bot, Code2, Loader2, SearchCode, Send, ShieldCheck, TerminalSquare, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const QUICK_PROMPTS = [
  'Review the current upload flow and identify the highest-risk regression points.',
  'Inspect Magic Library organization and propose the safest next improvement.',
  'Review recent commits on main and summarize what changed architecturally.',
  'Find duplicated AI logic and propose a consolidation plan without changing behavior.',
];

export default function DevAIWorkspace() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'I am SnapNext Dev AI. I can inspect the repository, search code, read recent commits, diagnose issues, and prepare safe implementation plans. This version is read-only and cannot modify or merge code.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastMeta, setLastMeta] = useState(null);

  const history = useMemo(() => messages.slice(-12).map(({ role, content }) => ({ role, content })), [messages]);

  async function send(value = draft) {
    const message = String(value || '').trim();
    if (!message || busy) return;
    const next = [...messages, { role: 'user', content: message }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    try {
      const result = await apiFetch('/dev-ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history }),
      });
      setMessages((current) => [...current, { role: 'assistant', content: result.text || 'No response returned.' }]);
      setLastMeta({ model: result.model, tools: result.tools || [], usage: result.usage || null });
    } catch (error) {
      toast.error(error?.message || 'Dev AI request failed');
      setMessages((current) => [...current, { role: 'assistant', content: `I could not complete that request: ${error?.message || 'unknown error'}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/[0.08] via-white/[0.025] to-purple-500/[0.08] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
            <Code2 className="h-3.5 w-3.5" /> SnapNext Dev AI
          </div>
          <h2 className="mt-3 text-2xl font-black text-white">Your in-app coding brain</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/50">Repository-aware diagnosis and implementation planning inside SnapNext AI OS.</p>
        </div>
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.08] px-3 py-2 text-xs text-emerald-100">
          <div className="flex items-center gap-1.5 font-black"><ShieldCheck className="h-3.5 w-3.5" /> Read-only safe mode</div>
          <div className="mt-1 text-emerald-100/55">No writes · no deploys · no merges</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} onClick={() => send(prompt)} disabled={busy} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left text-xs leading-5 text-white/60 transition hover:border-cyan-300/25 hover:text-white disabled:opacity-40">
            <SearchCode className="mb-2 h-4 w-4 text-cyan-200" />{prompt}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-3 md:p-4">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-6 rounded-2xl bg-purple-500/15 p-3' : 'mr-2 rounded-2xl border border-white/8 bg-white/[0.035] p-3'}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
              {message.role === 'user' ? <TerminalSquare className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              {message.role === 'user' ? 'You' : 'Dev AI'}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-6 text-white/75">{message.content}</div>
          </div>
        ))}
        {busy && <div className="mr-2 flex items-center gap-2 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.05] p-3 text-sm text-cyan-100"><Loader2 className="h-4 w-4 animate-spin" /> Inspecting SnapNext…</div>}
      </div>

      <div className="mt-3 flex gap-2">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Ask Dev AI to inspect, diagnose, review, or plan a coding task…" rows={3} className="min-h-20 flex-1 resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30" />
        <button onClick={() => send()} disabled={busy || !draft.trim()} className="self-stretch rounded-2xl bg-gradient-to-b from-cyan-400 to-purple-500 px-4 text-white disabled:opacity-35"><Send className="h-5 w-5" /></button>
      </div>

      {lastMeta && (
        <div className="mt-3 grid gap-2 text-[11px] text-white/40 md:grid-cols-3">
          <Meta icon={Bot} label="Model" value={lastMeta.model || '—'} />
          <Meta icon={Wrench} label="Repo tools" value={String(lastMeta.tools?.length || 0)} />
          <Meta icon={TerminalSquare} label="Output tokens" value={String(lastMeta.usage?.output_tokens || '—')} />
        </div>
      )}
    </section>
  );
}

function Meta({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2"><Icon className="h-3.5 w-3.5 text-cyan-200" /><span>{label}</span><span className="ml-auto font-bold text-white/65">{value}</span></div>;
}
