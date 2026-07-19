'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { Users, Plus, Sparkles, ExternalLink, Loader2, Bell, BellOff, Trash2, Link2, ShieldCheck, Radio, Bookmark, Eye, X } from 'lucide-react';

const PLATFORMS = ['instagram', 'youtube', 'x', 'tiktok', 'facebook', 'linkedin', 'reddit', 'github', 'rss', 'website'];
const PLATFORM_LABELS = { instagram: 'Instagram', youtube: 'YouTube', x: 'X', tiktok: 'TikTok', facebook: 'Facebook', linkedin: 'LinkedIn', reddit: 'Reddit', github: 'GitHub', rss: 'RSS', website: 'Website' };
const MODE_COPY = {
  public_api: ['Live-ready', 'Can use an approved public API after platform credentials are configured.'],
  oauth_required: ['Authorization needed', 'This platform requires an approved connection or creator authorization.'],
  link_only: ['Link only', 'SnapNext stores the profile shortcut and does not claim live synchronization.'],
};

export default function CirclesPage() {
  const [circles, setCircles] = useState([]);
  const [activeId, setActiveId] = useState('all');
  const [activeCircle, setActiveCircle] = useState(null);
  const [sources, setSources] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [showCircleForm, setShowCircleForm] = useState(false);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [circleForm, setCircleForm] = useState({ name: '', description: '', circleType: 'custom', notificationLevel: 'important', aiInstructions: '' });
  const [sourceForm, setSourceForm] = useState({ platform: 'instagram', input: '', displayName: '' });

  async function loadCircles(preferredId) {
    const result = await apiFetch('/circles');
    setCircles(result.circles || []);
    const nextId = preferredId || activeId;
    if (nextId !== 'all' && !(result.circles || []).some((circle) => circle.id === nextId)) setActiveId('all');
  }

  async function loadSelection() {
    setLoading(true);
    try {
      const feedUrl = activeId === 'all' ? '/circles/feed?limit=30' : `/circles/feed?circleId=${activeId}&limit=30`;
      const requests = [apiFetch(feedUrl)];
      if (activeId !== 'all') requests.push(apiFetch(`/circles/${activeId}`));
      const [feed, detail] = await Promise.all(requests);
      setUpdates(feed.updates || []);
      setActiveCircle(detail?.circle || null);
      setSources(detail?.sources || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCircles().catch((error) => { toast.error(error.message); setLoading(false); }); }, []);
  useEffect(() => { loadSelection(); }, [activeId]);

  const totalSources = useMemo(() => circles.reduce((sum, circle) => sum + (circle.sourceCount || 0), 0), [circles]);

  async function createCircle(event) {
    event.preventDefault();
    if (!circleForm.name.trim()) return;
    setBusy('circle');
    try {
      const result = await apiFetch('/circles', { method: 'POST', body: JSON.stringify(circleForm) });
      toast.success('Circle created');
      setCircleForm({ name: '', description: '', circleType: 'custom', notificationLevel: 'important', aiInstructions: '' });
      setShowCircleForm(false);
      await loadCircles(result.circle.id);
      setActiveId(result.circle.id);
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function addSource(event) {
    event.preventDefault();
    if (activeId === 'all' || !sourceForm.input.trim()) return;
    setBusy('source');
    try {
      const result = await apiFetch(`/circles/${activeId}/sources`, { method: 'POST', body: JSON.stringify(sourceForm) });
      const mode = result.source.connectionMode;
      toast.success(mode === 'link_only' ? 'Profile shortcut added safely' : 'Source added; platform setup is required for live updates');
      setSourceForm({ platform: sourceForm.platform, input: '', displayName: '' });
      setShowSourceForm(false);
      await Promise.all([loadCircles(activeId), loadSelection()]);
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function removeSource(sourceId) {
    setBusy(sourceId);
    try {
      await apiFetch(`/circles/${activeId}/sources/${sourceId}`, { method: 'DELETE' });
      toast.success('Source removed');
      await Promise.all([loadCircles(activeId), loadSelection()]);
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function toggleMute(source) {
    setBusy(source.id);
    try {
      await apiFetch(`/circles/${activeId}/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ isMuted: !source.isMuted }) });
      await loadSelection();
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function archiveCircle() {
    if (!activeCircle) return;
    setBusy('archive');
    try {
      await apiFetch(`/circles/${activeCircle.id}`, { method: 'DELETE' });
      toast.success('Circle archived');
      setActiveId('all');
      await loadCircles('all');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Users className="h-7 w-7 text-pink-400" /> Circles</h1>
          <p className="mt-1 max-w-2xl text-white/60">Follow what matters without living inside every app. SnapNext organizes approved signals, safe shortcuts and AI-ready updates—it does not copy private social feeds.</p>
        </div>
        <button onClick={() => setShowCircleForm(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-2.5 text-sm font-bold"><Plus className="h-4 w-4" /> New Circle</button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Circles" value={circles.length} icon={Users} />
        <Stat label="Sources" value={totalSources} icon={Link2} />
        <Stat label="Feed mode" value="Rights-aware" icon={ShieldCheck} text />
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <CircleChip active={activeId === 'all'} onClick={() => setActiveId('all')} name="All" count={totalSources} />
        {circles.map((circle) => <CircleChip key={circle.id} active={activeId === circle.id} onClick={() => setActiveId(circle.id)} name={circle.name} count={circle.sourceCount} />)}
      </div>

      {activeId !== 'all' && activeCircle && (
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xl font-bold">{activeCircle.name}</div>
              <p className="mt-1 text-sm text-white/55">{activeCircle.description || 'A private collection of sources that matter to you.'}</p>
              {activeCircle.aiInstructions && <p className="mt-3 flex items-start gap-2 text-xs text-purple-200/80"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /> AI focus: {activeCircle.aiInstructions}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSourceForm(true)} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black"><Plus className="h-4 w-4" /> Add account</button>
              <button onClick={archiveCircle} disabled={busy === 'archive'} title="Archive Circle" className="rounded-full border border-white/10 bg-white/5 p-2.5 text-white/60 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {sources.length === 0 ? <Empty title="No accounts added" body="Add a creator, person, brand, channel, RSS feed or profile shortcut." /> : sources.map((source) => (
              <div key={source.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-xs font-black uppercase">{source.platform.slice(0, 2)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{source.displayName}</div>
                    <div className="truncate text-xs text-white/45">{PLATFORM_LABELS[source.platform] || source.platform} · {source.handle}</div>
                  </div>
                  <button onClick={() => toggleMute(source)} disabled={busy === source.id} title={source.isMuted ? 'Unmute' : 'Mute'} className="p-1.5 text-white/50 hover:text-white">{source.isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}</button>
                  <button onClick={() => removeSource(source.id)} disabled={busy === source.id} title="Remove" className="p-1.5 text-white/50 hover:text-rose-300">{busy === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                </div>
                <ConnectionStatus source={source} />
                {source.profileUrl && <a href={source.profileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-pink-300 hover:text-pink-200">Open original profile <ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold">Circle feed</h2><p className="text-sm text-white/50">Meaningful updates will appear here when approved platform adapters are activated.</p></div>
          <span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-xs text-purple-200">AI ranking foundation active</span>
        </div>
        <div className="mt-5 space-y-3">
          {loading ? <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-pink-300" /></div> : updates.length === 0 ? <Empty title="Your feed is ready" body={activeId === 'all' && circles.length === 0 ? 'Create your first Circle, then add accounts you care about.' : 'Your saved sources are protected. Live updates will begin only through approved APIs, OAuth, embeds or deep links.'} /> : updates.map((update) => <UpdateCard key={update.id} update={update} />)}
        </div>
      </section>

      {showCircleForm && <Modal title="Create a Circle" onClose={() => setShowCircleForm(false)}><form onSubmit={createCircle} className="space-y-3"><Input label="Name" value={circleForm.name} onChange={(value) => setCircleForm({ ...circleForm, name: value })} placeholder="AI Leaders" /><Input label="Description" value={circleForm.description} onChange={(value) => setCircleForm({ ...circleForm, description: value })} placeholder="Companies and people shaping AI" /><Input label="AI focus" value={circleForm.aiInstructions} onChange={(value) => setCircleForm({ ...circleForm, aiInstructions: value })} placeholder="Prioritize launches, pricing and developer tools" /><button disabled={busy === 'circle'} className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-3 text-sm font-bold">{busy === 'circle' ? 'Creating…' : 'Create Circle'}</button></form></Modal>}

      {showSourceForm && <Modal title={`Add to ${activeCircle?.name || 'Circle'}`} onClose={() => setShowSourceForm(false)}><form onSubmit={addSource} className="space-y-4"><div><label className="mb-2 block text-xs font-semibold text-white/60">Platform</label><div className="grid grid-cols-3 gap-2">{PLATFORMS.map((platform) => <button type="button" key={platform} onClick={() => setSourceForm({ ...sourceForm, platform })} className={`rounded-xl border px-2 py-2 text-xs font-semibold ${sourceForm.platform === platform ? 'border-pink-400/50 bg-pink-500/15 text-white' : 'border-white/10 bg-white/5 text-white/55'}`}>{PLATFORM_LABELS[platform]}</button>)}</div></div><Input label="Username or profile URL" value={sourceForm.input} onChange={(value) => setSourceForm({ ...sourceForm, input: value })} placeholder="@username or https://…" /><Input label="Display name (optional)" value={sourceForm.displayName} onChange={(value) => setSourceForm({ ...sourceForm, displayName: value })} placeholder="Name shown in SnapNext" /><div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-3 text-xs leading-5 text-blue-100/80">SnapNext will clearly label this source as live-ready, authorization-required or link-only. It will never pretend unsupported accounts are synchronized.</div><button disabled={busy === 'source'} className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-3 text-sm font-bold">{busy === 'source' ? 'Adding…' : 'Add source'}</button></form></Modal>}
    </div>
  );
}

function Stat({ label, value, icon: Icon, text }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><Icon className="h-4 w-4 text-pink-300" /><div className={`${text ? 'text-lg' : 'text-2xl'} mt-3 font-black`}>{value}</div><div className="text-xs text-white/45">{label}</div></div>; }
function CircleChip({ active, onClick, name, count }) { return <button onClick={onClick} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${active ? 'border-pink-400/50 bg-pink-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/55'}`}>{name}{typeof count === 'number' && <span className="ml-2 text-xs opacity-60">{count}</span>}</button>; }
function ConnectionStatus({ source }) { const copy = MODE_COPY[source.connectionMode] || MODE_COPY.link_only; const active = source.connectionStatus === 'active'; return <div className={`mt-3 rounded-xl border p-3 text-xs ${active ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}><div className="flex items-center gap-2 font-bold">{active ? <Radio className="h-3.5 w-3.5 text-emerald-300" /> : <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />}{active ? 'Live' : copy[0]}</div><div className="mt-1 text-white/50">{active ? 'Approved updates are available.' : copy[1]}</div></div>; }
function Empty({ title, body }) { return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center"><Users className="mx-auto h-7 w-7 text-white/25" /><div className="mt-3 font-semibold">{title}</div><p className="mx-auto mt-1 max-w-lg text-sm text-white/45">{body}</p></div>; }
function Modal({ title, onClose, children }) { return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#12091d] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="rounded-full bg-white/5 p-2 text-white/60"><X className="h-4 w-4" /></button></div>{children}</div></div>; }
function Input({ label, value, onChange, placeholder }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-white/60">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-pink-400/50" /></label>; }
function UpdateCard({ update }) { return <article className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex items-center gap-2 text-xs text-white/45"><span className="font-bold uppercase">{update.platform}</span><span>•</span><span>{update.source?.displayName}</span></div><h3 className="mt-2 font-semibold">{update.title || `${update.source?.displayName || 'A source'} posted an update`}</h3>{update.excerpt && <p className="mt-2 text-sm text-white/60">{update.excerpt}</p>}<div className="mt-3 flex gap-2">{update.originalUrl && <a href={update.originalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">Open original <ExternalLink className="h-3 w-3" /></a>}<button className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/65"><Bookmark className="h-3 w-3" /> Save</button><button className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/65"><Eye className="h-3 w-3" /> Read</button></div></article>; }
