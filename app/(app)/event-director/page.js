'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { CalendarDays, CheckCircle2, Gift, Loader2, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_PROFILE = { name: '', relationship: '', birthday: '', anniversary: '', currentCountry: '', originCountries: '', celebrations: '', favourite: true };
const EMPTY_EVENT = { title: '', type: 'festival', date: '', annual: true, countries: '', cultureTags: '' };
const EMPTY_DATA = { profiles: [], events: [], drafts: [], upcoming: [], incompleteProfiles: [] };

function normalizeDirectorData(value) {
  const next = value && typeof value === 'object' ? value : {};
  return {
    ...next,
    profiles: Array.isArray(next.profiles) ? next.profiles : [],
    events: Array.isArray(next.events) ? next.events : [],
    drafts: Array.isArray(next.drafts) ? next.drafts : [],
    upcoming: Array.isArray(next.upcoming) ? next.upcoming : [],
    incompleteProfiles: Array.isArray(next.incompleteProfiles) ? next.incompleteProfiles : [],
  };
}

function daysLabel(value) {
  if (value === 0) return 'Today';
  if (value === 1) return 'Tomorrow';
  return `${value} days`;
}

export default function EventDirectorPage() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [event, setEvent] = useState(EMPTY_EVENT);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const next = await apiFetch('/life-event-director');
      setData(normalizeDirectorData(next));
    } catch (error) {
      toast.error(error.message || 'Event Director could not load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const urgent = useMemo(() => data.upcoming.filter(item => item.urgent), [data.upcoming]);

  async function saveProfile() {
    if (!profile.name.trim() || !profile.relationship.trim()) return toast.message('Add a name and relationship first.');
    setSaving(true);
    try {
      await apiFetch('/life-event-director', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save-profile',
          ...profile,
          originCountries: profile.originCountries.split(',').map(v => v.trim()).filter(Boolean),
          celebrations: profile.celebrations.split(',').map(v => v.trim()).filter(Boolean),
        }),
      });
      setProfile(EMPTY_PROFILE);
      await load();
      toast.success('Life profile saved.');
    } catch (error) { toast.error(error.message || 'Profile could not be saved.'); }
    finally { setSaving(false); }
  }

  async function saveEvent() {
    if (!event.title.trim() || !event.date) return toast.message('Add an event name and date first.');
    setSaving(true);
    try {
      await apiFetch('/life-event-director', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save-event',
          ...event,
          countries: event.countries.split(',').map(v => v.trim()).filter(Boolean),
          cultureTags: event.cultureTags.split(',').map(v => v.trim()).filter(Boolean),
        }),
      });
      setEvent(EMPTY_EVENT);
      await load();
      toast.success('Celebration added.');
    } catch (error) { toast.error(error.message || 'Event could not be saved.'); }
    finally { setSaving(false); }
  }

  async function prepare(item) {
    try {
      const result = await apiFetch('/life-event-director', {
        method: 'POST',
        body: JSON.stringify({ action: 'prepare-package', eventId: item.id, formats: item.suggestions }),
      });
      setData(current => ({ ...current, drafts: [result.draft, ...current.drafts] }));
      toast.success('Celebration package planned. Nothing will post without your approval.');
    } catch (error) { toast.error(error.message || 'Package could not be prepared.'); }
  }

  if (loading) return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/50" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-24">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-fuchsia-500/20 via-purple-500/10 to-cyan-500/10 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-pink-200">AI Life Event Director</p><h1 className="mt-2 text-3xl font-black md:text-5xl">Never miss a moment worth celebrating.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Track birthdays, anniversaries, family traditions, festivals from every culture you celebrate, national days, trips, and milestones. SnapNext prepares ideas early and always asks before sharing.</p></div>
          <Link href="/ai-studio" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black"><Sparkles className="h-4 w-4" /> Open AI Studio</Link>
        </div>
      </section>

      {urgent.length > 0 && <section><h2 className="mb-3 text-xl font-black">Needs attention now</h2><div className="grid gap-3 md:grid-cols-2">{urgent.map(item => <EventCard key={item.id} item={item} prepare={prepare} />)}</div></section>}

      <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-pink-200" /><h2 className="text-xl font-black">Coming up</h2></div>
          <div className="mt-4 space-y-3">{data.upcoming.length ? data.upcoming.map(item => <EventCard key={item.id} item={item} prepare={prepare} compact />) : <Empty text="Add a person or celebration to begin." />}</div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-cyan-200" /><h2 className="text-xl font-black">Profile readiness</h2></div><div className="mt-4 space-y-3">{data.incompleteProfiles.length ? data.incompleteProfiles.slice(0, 6).map(item => <div key={item.id} className="rounded-2xl bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><div><div className="font-bold">{item.name}</div><div className="text-xs text-white/45">{item.relationship}</div></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{item.completeness.percent}%</span></div><p className="mt-2 text-xs text-white/45">Missing: {[...item.completeness.missingRequired, ...item.completeness.missingRecommended].slice(0, 3).join(', ') || 'optional details'}</p></div>) : <div className="flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Important profiles are ready.</div>}</div></div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center gap-2"><Gift className="h-5 w-5 text-amber-200" /><h2 className="text-xl font-black">Prepared packages</h2></div><div className="mt-4 space-y-2">{data.drafts.length ? data.drafts.map(draft => <div key={draft.id} className="rounded-2xl bg-black/20 p-3"><div className="font-bold">{draft.title}</div><div className="mt-1 text-xs text-white/45">{draft.formats.join(' · ')}</div><div className="mt-2 text-[11px] font-bold text-emerald-200">Approval required before sharing</div></div>) : <Empty text="Choose Prepare package on an event." />}</div></div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <FormCard title="Add family or favourite person" subtitle="A person may live in Canada and still celebrate traditions from one or many cultures.">
          <Input label="Name" value={profile.name} setValue={value => setProfile(p => ({ ...p, name: value }))} />
          <Input label="Relationship" value={profile.relationship} setValue={value => setProfile(p => ({ ...p, relationship: value }))} />
          <div className="grid grid-cols-2 gap-3"><Input label="Birthday" type="date" value={profile.birthday} setValue={value => setProfile(p => ({ ...p, birthday: value }))} /><Input label="Anniversary" type="date" value={profile.anniversary} setValue={value => setProfile(p => ({ ...p, anniversary: value }))} /></div>
          <Input label="Current country" value={profile.currentCountry} setValue={value => setProfile(p => ({ ...p, currentCountry: value }))} placeholder="Canada" />
          <Input label="Countries of origin" value={profile.originCountries} setValue={value => setProfile(p => ({ ...p, originCountries: value }))} placeholder="India, Canada" />
          <Input label="Celebrations and traditions" value={profile.celebrations} setValue={value => setProfile(p => ({ ...p, celebrations: value }))} placeholder="Diwali, Canada Day, Christmas, family picnic" />
          <button onClick={saveProfile} disabled={saving} className="mt-2 w-full rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-40">Save life profile</button>
        </FormCard>

        <FormCard title="Add an occasion" subtitle="Use this for festivals, patriotic days, annual traditions, trips, milestones, or any family event.">
          <Input label="Event name" value={event.title} setValue={value => setEvent(e => ({ ...e, title: value }))} placeholder="Diwali family celebration" />
          <label className="block text-xs font-bold text-white/55">Type<select value={event.type} onChange={e => setEvent(v => ({ ...v, type: e.target.value }))} className="mt-1 w-full rounded-2xl border border-white/10 bg-[#160c21] px-4 py-3 text-sm"><option value="festival">Festival</option><option value="national-day">National or patriotic day</option><option value="tradition">Family tradition</option><option value="milestone">Milestone</option><option value="trip">Trip</option><option value="other">Other</option></select></label>
          <Input label="Date" type="date" value={event.date} setValue={value => setEvent(e => ({ ...e, date: value }))} />
          <Input label="Relevant countries" value={event.countries} setValue={value => setEvent(e => ({ ...e, countries: value }))} placeholder="Canada, India" />
          <Input label="Culture or tradition tags" value={event.cultureTags} setValue={value => setEvent(e => ({ ...e, cultureTags: value }))} placeholder="Punjabi, Hindu, Canadian, family" />
          <label className="flex items-center gap-2 text-sm text-white/65"><input type="checkbox" checked={event.annual} onChange={e => setEvent(v => ({ ...v, annual: e.target.checked }))} /> Repeat every year</label>
          <button onClick={saveEvent} disabled={saving} className="mt-2 w-full rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-40">Add occasion</button>
        </FormCard>
      </section>
    </div>
  );
}

function EventCard({ item, prepare, compact = false }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-wider text-pink-200">{item.type.replace('-', ' ')}</div><h3 className={`${compact ? 'text-base' : 'text-lg'} mt-1 font-black`}>{item.title}</h3><p className="mt-1 text-xs text-white/45">{daysLabel(item.daysUntil)} · {item.stage.replaceAll('-', ' ')}</p></div><button onClick={() => prepare(item)} className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-xs font-black">Prepare</button></div><div className="mt-3 flex flex-wrap gap-1.5">{item.suggestions.slice(0, compact ? 3 : 5).map(format => <span key={format} className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/50">{format.replaceAll('-', ' ')}</span>)}</div></div>;
}

function FormCard({ title, subtitle, children }) { return <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm leading-5 text-white/45">{subtitle}</p><div className="mt-5 space-y-3">{children}</div></div>; }
function Input({ label, value, setValue, type = 'text', placeholder = '' }) { return <label className="block text-xs font-bold text-white/55">{label}<input type={type} value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none" /></label>; }
function Empty({ text }) { return <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/40">{text}</div>; }
