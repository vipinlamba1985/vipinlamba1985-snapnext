'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, Heart, ChevronRight, Cloud, Send, TrendingUp, Crown, Bot, Copy, AlertTriangle, Users } from 'lucide-react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';

export default function Dashboard() {
  const [usage, setUsage] = useState(null);
  const [media, setMedia] = useState([]);
  const [memories, setMemories] = useState(null);
  const [insights, setInsights] = useState(null);
  const [aiHighlights, setAiHighlights] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    apiFetch('/storage/usage').then(setUsage).catch(()=>{});
    apiFetch('/media').then(d => setMedia(d.items || [])).catch(()=>{});
    apiFetch('/memories').then(setMemories).catch(()=>{});
    apiFetch('/insights').then(setInsights).catch(()=>{});
  }, []);

  async function genAiHighlights() {
    setAiBusy(true);
    try { const d = await apiFetch('/insights/ai-summary', { method: 'POST' }); setAiHighlights(d.highlights || []); }
    catch (e) { setAiHighlights([e.message]); }
    finally { setAiBusy(false); }
  }

  const recent = media.slice(0, 8);
  const photos = media.filter(m => m.kind === 'photo').length;
  const videos = media.filter(m => m.kind === 'video').length;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/20 via-fuchsia-500/10 to-indigo-500/20 p-8">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-pink-500/30 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs text-white/70"><Sparkles className="h-3.5 w-3.5 text-pink-300" /> Welcome back</div>
          <h1 className="mt-2 text-3xl md:text-4xl font-bold">Your memories, ready for today.</h1>
          <p className="mt-2 text-white/70">Back up everything, organize with AI, share with the people you love.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/upload" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black font-medium"><Upload className="h-4 w-4"/> Back up everything</Link>
            <Link href="/ai-studio" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/15 hover:bg-white/10"><Sparkles className="h-4 w-4"/> Try AI Studio</Link>
          </div>
        </div>
      </section>

      {/* Smart Backup Assistant */}
      {insights && insights.totals.count > 0 && (
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-500/15 via-purple-500/10 to-indigo-500/15 p-6">
          <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl"/>
          <div className="relative flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-white/10"><Bot className="h-3.5 w-3.5 text-pink-300"/> Smart Backup Assistant</div>
              <h2 className="mt-2 text-2xl font-bold">Your memory pulse</h2>
            </div>
            <button onClick={genAiHighlights} disabled={aiBusy} className="text-sm inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-60">
              <Sparkles className="h-3.5 w-3.5"/>{aiBusy ? 'Thinking…' : 'AI insights'}
            </button>
          </div>
          {aiHighlights.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {aiHighlights.map((h, i) => (
                <li key={i} className="text-sm flex items-start gap-2"><Sparkles className="h-3.5 w-3.5 mt-0.5 text-pink-300 flex-none"/><span>{typeof h === 'string' ? h : JSON.stringify(h)}</span></li>
              ))}
            </ul>
          )}
          <div className="mt-5 grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            <InsightTile icon={ImageIcon} grad="from-pink-500 to-purple-600" title="Most photographed" value={insights.mostPhotographed ? `${insights.mostPhotographed.label}` : '—'} sub={insights.mostPhotographed ? `${insights.mostPhotographed.count} memories` : ''} />
            <InsightTile icon={TrendingUp} grad="from-amber-400 to-orange-500" title="This month" value={`${insights.thisMonth.count} new`} sub={insights.thisMonth.label} />
            <InsightTile icon={Cloud} grad="from-violet-500 to-indigo-600" title="Year total" value={insights.thisYear.count} sub={insights.thisYear.label} />
            <InsightTile icon={Copy} grad="from-rose-500 to-pink-600" title="Duplicates" value={insights.duplicates.extraCopies || 0} sub={insights.duplicates.extraCopies ? `Free up ${formatBytes(insights.duplicates.savingsBytes)}` : 'Library is clean'} />
            <InsightTile icon={AlertTriangle} grad="from-amber-500 to-rose-500" title="Large videos" value={insights.largeVideos.count} sub={insights.largeVideos.count ? formatBytes(insights.largeVideos.bytes) : 'None over 200 MB'} />
            <InsightTile icon={Users} grad="from-fuchsia-500 to-pink-600" title="Sharing tip" value={insights.sharing.neverSharedFavorites.length || 0} sub={insights.sharing.neverSharedFavorites.length ? `Haven't shared with ${insights.sharing.neverSharedFavorites.map(f => f.name).slice(0,2).join(', ')}` : 'All caught up'} />
          </div>
          {!insights.plan.isSuper && insights.forecast.monthsLeft != null && insights.forecast.monthsLeft <= 6 && (
            <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300"/>
              <span>At your current pace, you'll fill {insights.plan.name} in ~{insights.forecast.monthsLeft} month{insights.forecast.monthsLeft === 1 ? '' : 's'}.</span>
              <Link href="/billing" className="ml-auto text-xs px-3 py-1 rounded-full bg-white text-black font-medium">Upgrade</Link>
            </div>
          )}
        </section>
      )}

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Photos" value={photos} icon={ImageIcon} grad="from-pink-500 to-rose-500" />
        <Stat label="Videos" value={videos} icon={ImageIcon} grad="from-violet-500 to-indigo-600" />
        <Stat label="Memories" value={memories?.groups?.length || 0} icon={Heart} grad="from-fuchsia-500 to-purple-600" />
        <Stat label={usage?.isSuper ? 'Storage' : 'Storage used'} value={usage ? (usage.isSuper ? '∞' : formatBytes(usage.usage.bytes)) : '—'} icon={Cloud} grad="from-amber-400 to-orange-500" />
      </section>

      {/* Recent */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recently added</h2>
          <Link href="/gallery" className="text-sm text-pink-300 hover:underline inline-flex items-center gap-1">Open gallery <ChevronRight className="h-4 w-4"/></Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-4 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {recent.map(m => (
              <Link key={m.id} href="/gallery" className="group relative aspect-square rounded-xl overflow-hidden bg-white/5">
                {m.kind === 'photo' ? (
                  <img src={mediaSrc(m.id)} alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition" />
                ) : (
                  <video src={mediaSrc(m.id)} className="absolute inset-0 h-full w-full object-cover" muted />
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Suggestions */}
      <section className="grid md:grid-cols-3 gap-4">
        <CTA href="/ai-studio" title="Create an AI caption" desc="Turn any photo into a story-ready post." icon={Sparkles} grad="from-pink-500 to-purple-600" />
        <CTA href="/memories" title="Revisit memories" desc="On this day, monthly highlights, and more." icon={Heart} grad="from-rose-500 to-pink-600" />
        <CTA href="/billing" title="Get more space" desc="Plus and Pro unlock larger storage & favorites." icon={TrendingUp} grad="from-amber-400 to-orange-500" />
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon, grad }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${grad} grid place-items-center mb-3`}><Icon className="h-4 w-4"/></div>
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
function CTA({ href, title, desc, icon: Icon, grad }) {
  return (
    <Link href={href} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06] transition group">
      <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${grad} grid place-items-center mb-3`}><Icon className="h-5 w-5"/></div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-white/60 mt-1">{desc}</div>
      <div className="mt-3 text-sm text-pink-300 inline-flex items-center gap-1">Open <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition"/></div>
    </Link>
  );
}
function EmptyState() {
  return (
    <Link href="/upload" className="mt-4 block rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center hover:bg-white/[0.04]">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center"><Upload className="h-5 w-5"/></div>
      <div className="mt-3 font-medium">No memories yet</div>
      <div className="text-sm text-white/60">Tap to back up your first photos.</div>
    </Link>
  );
}

function InsightTile({ icon: Icon, grad, title, value, sub }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${grad} grid place-items-center mb-3`}><Icon className="h-4 w-4"/></div>
      <div className="text-xs text-white/60">{title}</div>
      <div className="text-lg font-bold mt-0.5 truncate">{value}</div>
      {sub && <div className="text-[11px] text-white/50 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
