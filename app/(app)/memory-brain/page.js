'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const OPTIONS = ['spouse','wife','husband','partner','daughter','son','child','mother','mom','father','dad','sister','brother','grandmother','grandma','grandfather','grandpa','friend','pet','other'];

export default function MemoryBrainPage() {
  const [brain, setBrain] = useState(null);
  const [context, setContext] = useState({ relationships: [], events: [] });
  const [personName, setPersonName] = useState('');
  const [relationship, setRelationship] = useState('friend');
  const [eventTitle, setEventTitle] = useState('');
  const [eventIds, setEventIds] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [brainData, contextData] = await Promise.all([apiFetch('/memory-brain'), apiFetch('/memory-context')]);
      setBrain(brainData);
      setContext(contextData);
    } catch (error) {
      toast.error(error.message || 'Could not load Memory Brain.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveRelationship(event) {
    event.preventDefault();
    if (!personName.trim()) return toast.error('Choose a person name.');
    await apiFetch('/memory-context', { method: 'POST', body: JSON.stringify({ type: 'relationship', personName, displayName: personName, relationship }) });
    toast.success('Relationship confirmed.');
    setPersonName('');
    load();
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!eventTitle.trim()) return toast.error('Enter an event name.');
    await apiFetch('/memory-context', { method: 'POST', body: JSON.stringify({ type: 'event', title: eventTitle, memoryIds: eventIds }) });
    toast.success('Event confirmed.');
    setEventTitle('');
    setEventIds([]);
    load();
  }

  async function remove(type, id) {
    await apiFetch('/memory-context', { method: 'DELETE', body: JSON.stringify({ type, id }) });
    toast.success('Removed.');
    load();
  }

  if (loading) return <div className="p-8 text-white/60">Loading Memory Brain…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-500/15 via-pink-500/10 to-cyan-500/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-100/70">Memory Brain controls</p>
        <h1 className="mt-2 text-3xl font-black text-white">Teach LifeGPT safely</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">LifeGPT uses only relationships and events you confirm here. Detected names are never treated as family roles automatically.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-xl font-black text-white">Relationship labels</h2>
          <form onSubmit={saveRelationship} className="mt-4 space-y-3">
            <input list="people" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Detected person name" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
            <datalist id="people">{(brain?.relationships?.people || []).map((item) => <option key={item.name} value={item.name} />)}</datalist>
            <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white">{OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
            <button className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-black">Save relationship</button>
          </form>
          <div className="mt-5 space-y-2">{context.relationships.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3"><div><p className="font-bold text-white">{item.displayName || item.personName}</p><p className="text-xs text-white/45">{item.relationship}</p></div><button onClick={() => remove('relationship', item.id)} className="text-xs text-rose-200">Remove</button></div>)}</div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-xl font-black text-white">Confirmed events</h2>
          <form onSubmit={saveEvent} className="mt-4 space-y-3">
            <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Event name, e.g. Goa Trip 2026" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
            <p className="text-xs text-white/45">{eventIds.length ? `${eventIds.length} memories selected` : 'Choose a suggested group below.'}</p>
            <button className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-black">Confirm event</button>
          </form>
          <div className="mt-5 space-y-2">{(brain?.events || []).slice(0, 6).map((item) => <button key={item.id} onClick={() => { setEventTitle(item.title); setEventIds(item.memoryIds || []); }} className="w-full rounded-2xl bg-black/20 p-3 text-left"><p className="font-bold text-white">{item.title}</p><p className="text-xs text-white/45">{item.count} suggested memories</p></button>)}</div>
          <div className="mt-5 space-y-2">{context.events.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3"><div><p className="font-bold text-white">{item.title}</p><p className="text-xs text-white/45">{item.memoryIds?.length || 0} memories</p></div><button onClick={() => remove('event', item.id)} className="text-xs text-rose-200">Remove</button></div>)}</div>
        </section>
      </div>
    </div>
  );
}
