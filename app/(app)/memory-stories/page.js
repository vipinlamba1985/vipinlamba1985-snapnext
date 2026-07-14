'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const TONES = ['warm', 'reflective', 'celebratory', 'simple', 'playful'];

export default function MemoryStoriesPage() {
  const [data, setData] = useState({ events: [], stories: [] });
  const [eventId, setEventId] = useState('');
  const [tone, setTone] = useState('warm');
  const [length, setLength] = useState('medium');
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(null);

  async function load() {
    try {
      const next = await apiFetch('/memory-stories');
      setData(next);
      if (!eventId && next.events?.[0]?.id) setEventId(next.events[0].id);
      if (!selected && next.stories?.[0]) setSelected(next.stories[0]);
    } catch (error) {
      toast.error(error.message || 'Could not load Story Builder.');
    }
  }

  useEffect(() => { load(); }, []);

  async function generate(event) {
    event.preventDefault();
    if (!eventId) return toast.error('Confirm an event in Memory Brain first.');
    setGenerating(true);
    try {
      const result = await apiFetch('/memory-stories', {
        method: 'POST',
        body: JSON.stringify({ eventId, tone, length }),
      });
      setSelected(result.story);
      toast.success(result.cached ? 'Loaded your existing grounded draft — 0 credits.' : 'Private grounded story draft created.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Story generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id) {
    await apiFetch('/memory-stories', { method: 'DELETE', body: JSON.stringify({ id }) });
    toast.success('Draft removed.');
    if (selected?.id === id) setSelected(null);
    load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-fuchsia-500/15 via-violet-500/10 to-cyan-500/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-fuchsia-100/70">LifeGPT Story Builder</p>
        <h1 className="mt-2 text-3xl font-black text-white">Turn confirmed memories into a grounded story</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Every sentence must come from the selected event’s saved memories. Drafts stay private, include source evidence, and are never published or shared automatically.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-xl font-black text-white">Create a private draft</h2>
          {data.events?.length ? (
            <form onSubmit={generate} className="mt-4 space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-white/45">Confirmed event</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white">
                {data.events.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.memoryIds?.length || 0} memories</option>)}
              </select>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/45">Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white">
                {TONES.map((item) => <option key={item}>{item}</option>)}
              </select>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/45">Length</label>
              <div className="grid grid-cols-3 gap-2">{['short', 'medium', 'long'].map((item) => <button type="button" key={item} onClick={() => setLength(item)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${length === item ? 'border-white bg-white text-black' : 'border-white/10 bg-black/20 text-white/60'}`}>{item}</button>)}</div>
              <button disabled={generating} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-black text-black disabled:opacity-50">{generating ? 'Creating grounded draft…' : 'Create story draft'}</button>
              <p className="text-xs leading-5 text-white/40">Generation uses AI Credits. Reopening the same event, tone and length with unchanged sources uses the cached draft for 0 credits.</p>
            </form>
          ) : (
            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4 text-sm text-amber-100/70">Confirm an event first in <Link href="/memory-brain" className="font-bold underline">Memory Brain</Link>.</div>
          )}

          <h3 className="mt-8 text-sm font-black uppercase tracking-wider text-white/50">Saved private drafts</h3>
          <div className="mt-3 space-y-2">{data.stories?.map((item) => <div key={item.id} className="rounded-2xl bg-black/20 p-3"><button onClick={() => setSelected(item)} className="w-full text-left"><p className="font-bold text-white">{item.title}</p><p className="mt-1 text-xs text-white/40">{item.eventTitle} · {item.sourceIds?.length || 0} sources · {item.tone}</p></button><button onClick={() => remove(item.id)} className="mt-2 text-xs text-rose-200">Remove draft</button></div>)}</div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          {selected ? <>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-200/70">Grounded private draft</p><h2 className="mt-1 text-2xl font-black text-white">{selected.title}</h2></div><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">{selected.status || 'draft'}</span></div>
            <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/75">{selected.body}</div>
            <div className="mt-7 border-t border-white/10 pt-5"><h3 className="text-sm font-black uppercase tracking-wider text-white/50">Source memories</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{selected.sources?.map((source) => <div key={source.id} className="rounded-2xl bg-black/20 p-3"><p className="text-xs font-black text-fuchsia-200">[{source.source}] {source.kind}</p><p className="mt-1 truncate text-sm font-bold text-white">{source.name}</p><p className="mt-1 text-xs text-white/40">{source.date ? new Date(source.date).toLocaleDateString() : 'Date unavailable'}</p></div>)}</div></div>
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/45">This phase creates drafts only. Sharing, exporting or posting will require a separate explicit user action in a later confirmed-action phase.</p>
          </> : <div className="flex min-h-[360px] items-center justify-center text-center text-sm text-white/40">Choose or generate a grounded story draft.</div>}
        </section>
      </div>
    </div>
  );
}
