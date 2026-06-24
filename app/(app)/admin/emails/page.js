'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { Mail, Search, RefreshCw } from 'lucide-react';

const TEMPLATES = ['', 'verify_email', 'welcome', 'forgot_password', 'password_changed', 'billing_upgrade', 'billing_downgrade', 'billing_failed', 'download_ready', 'favorites_invite', 'community_invite'];
const STATUSES = ['', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'skipped'];
const STATUS_COLOR = {
  sent: 'bg-sky-500/20 text-sky-200', delivered: 'bg-emerald-500/20 text-emerald-200',
  opened: 'bg-fuchsia-500/20 text-fuchsia-200', clicked: 'bg-violet-500/20 text-violet-200',
  bounced: 'bg-rose-500/20 text-rose-200', complained: 'bg-orange-500/20 text-orange-200',
  failed: 'bg-rose-500/30 text-rose-200', skipped: 'bg-white/10 text-white/70',
};

export default function AdminEmails() {
  const [events, setEvents] = useState([]);
  const [template, setTemplate] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    try {
      const p = new URLSearchParams();
      if (template) p.set('template', template);
      if (status) p.set('status', status);
      if (q) p.set('q', q);
      const d = await apiFetch('/admin/emails?' + p.toString());
      setEvents(d.events || []);
      setErr('');
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [template, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  if (err) return <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm">Admin access required. {err}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-pink-300"/><h1 className="text-3xl font-bold">Email log</h1></div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={template} onChange={(e)=>setTemplate(e.target.value)} className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-sm">
          {TEMPLATES.map(t => <option key={t} value={t}>{t || 'All templates'}</option>)}
        </select>
        <select value={status} onChange={(e)=>setStatus(e.target.value)} className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-sm">
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"/>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search recipient…" className="w-full pl-9 pr-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm outline-none"/>
        </div>
        <button onClick={load} className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><RefreshCw className="h-3.5 w-3.5"/>Refresh</button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-4 py-3 text-sm font-medium border-b border-white/5">{events.length} events</div>
        <div className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
          {events.map(e => (
            <div key={e.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[e.status] || 'bg-white/10 text-white/70'}`}>{e.status}</span>
              <span className="font-mono text-xs text-white/50 w-36 truncate">{e.template}</span>
              <span className="flex-1 min-w-0 truncate">{e.to}</span>
              <span className="text-xs text-white/40">{e.provider}</span>
              <span className="text-xs text-white/40 w-32 text-right">{new Date(e.sentAt).toLocaleString()}</span>
            </div>
          ))}
          {events.length === 0 && <div className="p-10 text-center text-white/50">No email events yet.</div>}
        </div>
      </div>
    </div>
  );
}
