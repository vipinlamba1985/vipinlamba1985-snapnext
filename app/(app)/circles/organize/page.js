'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { BellRing, Bookmark, Check, Clock3, ExternalLink, Loader2, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';

const MODE_COPY = {
  calm: 'Only urgent events and important people interrupt you.',
  balanced: 'Important items appear now; useful updates wait for one digest.',
  connected: 'See more frequent updates from the Circles you selected.',
};
const BUCKETS = [
  { id: 'today', label: 'Today', description: 'Time-sensitive and important', icon: BellRing },
  { id: 'later', label: 'Later', description: 'Useful, but not urgent', icon: Clock3 },
  { id: 'library', label: 'Library', description: 'Saved quietly for reference', icon: Bookmark },
];

export default function CircleOrganizerPage() {
  const [data, setData] = useState({ counts: {}, sections: { today: [], later: [], library: [] }, circles: [], preferences: { mode: 'balanced' } });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', originalUrl: '', summary: '', circleId: '', signalType: 'link', priority: 60, dueAt: '' });

  async function load() {
    try { setData(await apiFetch('/circle-organizer')); }
    catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const totalVisible = useMemo(() => Object.values(data.sections || {}).reduce((sum, items) => sum + items.length, 0), [data.sections]);

  async function setMode(mode) {
    setBusy(`mode-${mode}`);
    try {
      await apiFetch('/circle-organizer/preferences', { method: 'PATCH', body: JSON.stringify({ mode }) });
      toast.success(`${mode[0].toUpperCase() + mode.slice(1)} mode active`);
      await load();
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function addSignal(event) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setBusy('add');
    try {
      const body = { ...form, priority: Number(form.priority), circleId: form.circleId || null, dueAt: form.dueAt || null };
      const result = await apiFetch('/circle-organizer/signals', { method: 'POST', body: JSON.stringify(body) });
      toast.success(result.existing ? 'Already organized' : `Added to ${result.signal.bucket}`);
      setForm({ title: '', originalUrl: '', summary: '', circleId: '', signalType: 'link', priority: 60, dueAt: '' });
      setShowForm(false);
      await load();
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function move(signal, bucket) {
    setBusy(signal.id);
    try {
      await apiFetch(`/circle-organizer/signals/${signal.id}`, { method: 'PATCH', body: JSON.stringify({ bucket, isRead: bucket !== 'today' }) });
      await load();
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function remove(signal) {
    setBusy(signal.id);
    try { await apiFetch(`/circle-organizer/signals/${signal.id}`, { method: 'DELETE' }); await load(); }
    catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-pink-300" /></div>;

  return <div className="space-y-7">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" /> Private attention organizer</div>
        <h1 className="text-3xl font-bold">Everything that matters, organized around your life.</h1>
        <p className="mt-2 max-w-3xl text-white/60">Circles separates what needs attention now, what can wait, and what is worth keeping. You choose every source; SnapNext does not secretly read your social life.</p>
      </div>
      <div className="flex gap-2"><Link href="/circles" className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold">Manage Circles</Link><button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-bold"><Plus className="h-4 w-4" /> Organize something</button></div>
    </header>

    <section className="grid gap-3 sm:grid-cols-4">
      <Stat label="Needs attention" value={data.counts?.important || 0} /><Stat label="In your digest" value={data.counts?.digest || 0} /><Stat label="Organized quietly" value={data.counts?.organizedSilently || 0} /><Stat label="Total organized" value={totalVisible} />
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4"><h2 className="font-bold">How connected should SnapNext feel?</h2><p className="text-sm text-white/50">Balanced is the recommended default. You can change this anytime.</p></div>
      <div className="grid gap-3 md:grid-cols-3">{Object.entries(MODE_COPY).map(([mode, description]) => { const active = data.preferences?.mode === mode; return <button key={mode} onClick={() => setMode(mode)} disabled={busy === `mode-${mode}`} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-pink-400/50 bg-pink-500/15' : 'border-white/10 bg-black/10 hover:bg-white/5'}`}><div className="flex items-center justify-between"><span className="font-bold capitalize">{mode}</span>{active && <Check className="h-4 w-4 text-pink-300" />}</div><p className="mt-2 text-xs leading-5 text-white/55">{description}</p></button>; })}</div>
    </section>

    <section className="grid gap-4 xl:grid-cols-3">{BUCKETS.map((bucket) => <Bucket key={bucket.id} bucket={bucket} items={data.sections?.[bucket.id] || []} busy={busy} onMove={move} onRemove={remove} />)}</section>

    <section className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/15 to-pink-500/5 p-5"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-purple-200" /><div><h2 className="font-bold">Proof of the calm model</h2><p className="mt-1 text-sm leading-6 text-white/60">This build performs deterministic filtering first. AI is reserved for future batch digests and questions, preventing one costly model call for every saved item. Your badge can represent important unread items instead of raw activity.</p></div></div></section>

    {showForm && <Modal onClose={() => setShowForm(false)}><form onSubmit={addSignal} className="space-y-4"><div><h2 className="text-xl font-bold">Organize something</h2><p className="text-sm text-white/50">Save a link, note or reminder into the right part of your digital life.</p></div><Input label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} placeholder="Dad's vacation photos" /><Input label="Link (optional)" value={form.originalUrl} onChange={(value) => setForm({ ...form, originalUrl: value })} placeholder="https://…" /><Input label="Note (optional)" value={form.summary} onChange={(value) => setForm({ ...form, summary: value })} placeholder="Why this matters" /><div className="grid gap-3 sm:grid-cols-2"><Select label="Circle" value={form.circleId} onChange={(value) => setForm({ ...form, circleId: value })}><option value="">No Circle</option>{data.circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}</Select><Select label="Type" value={form.signalType} onChange={(value) => setForm({ ...form, signalType: value })}><option value="link">Saved link</option><option value="reminder">Reminder</option><option value="note">Note</option></Select></div><div className="grid gap-3 sm:grid-cols-2"><Input label="Priority (0–100)" type="number" value={form.priority} onChange={(value) => setForm({ ...form, priority: value })} /><Input label="Due date (optional)" type="datetime-local" value={form.dueAt} onChange={(value) => setForm({ ...form, dueAt: value })} /></div><button disabled={busy === 'add'} className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-3 text-sm font-bold">{busy === 'add' ? 'Organizing…' : 'Organize now'}</button></form></Modal>}
  </div>;
}

function Stat({ label, value }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-xs text-white/50">{label}</div></div>; }
function Bucket({ bucket, items, busy, onMove, onRemove }) { const Icon = bucket.icon; return <section className="min-h-[320px] rounded-3xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10"><Icon className="h-4 w-4 text-pink-300" /></div><div><h2 className="font-bold">{bucket.label}</h2><p className="text-xs text-white/45">{bucket.description}</p></div><span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-xs">{items.length}</span></div><div className="mt-4 space-y-3">{items.length === 0 ? <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-white/10 text-center text-xs text-white/35">Nothing here yet.<br />That is a calm result.</div> : items.map((signal) => <article key={signal.id} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="font-semibold leading-5">{signal.title}</div><div className="mt-1 text-[11px] text-white/40">{signal.sourceLabel} · Priority {signal.priority}</div>{signal.summary && <p className="mt-2 text-xs leading-5 text-white/55">{signal.summary}</p>}<p className="mt-2 text-[11px] text-purple-200/70">Why: {signal.why}</p></div>{signal.originalUrl && <a href={signal.originalUrl} target="_blank" rel="noreferrer" className="text-white/45 hover:text-white"><ExternalLink className="h-4 w-4" /></a>}</div><div className="mt-3 flex flex-wrap gap-2">{BUCKETS.filter((target) => target.id !== bucket.id).map((target) => <button key={target.id} disabled={busy === signal.id} onClick={() => onMove(signal, target.id)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold">Move to {target.label}</button>)}<button disabled={busy === signal.id} onClick={() => onRemove(signal)} className="ml-auto p-1 text-white/35 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div></article>)}</div></section>; }
function Input({ label, value, onChange, type = 'text', placeholder }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-white/60">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-pink-400/50" /></label>; }
function Select({ label, value, onChange, children }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-white/60">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#170d22] px-4 py-3 text-sm outline-none">{children}</select></label>; }
function Modal({ children, onClose }) { return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-[#12091d] p-6 shadow-2xl"><div className="mb-3 flex justify-end"><button type="button" onClick={onClose} className="text-sm text-white/50">Close</button></div>{children}</div></div>; }
