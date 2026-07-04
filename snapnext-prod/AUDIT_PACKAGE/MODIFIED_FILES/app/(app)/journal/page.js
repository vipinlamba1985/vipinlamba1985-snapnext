'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Sparkles, BookOpen, MapPin, Users, Loader2, Star,
  PenTool, Flame, Heart, RefreshCw, AlertTriangle, ArrowRight, Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// SnapNext AI Life Journal — truthful implementation.
//
// Prior versions of this page rendered hardcoded fabricated personal data
// (fake names, spouses, children, trips, and AI observations) which is a
// launch blocker. This rewrite reads only from the existing production
// /memories/timeline endpoint and derives real cycle-level stats/highlights
// from the authenticated user's actual media. It never fabricates people,
// places, relationships, dates, or AI narratives.

const CYCLES = [
  { id: 'daily',   label: 'Daily',   emoji: '📖', title: "Today's Living Journal" },
  { id: 'weekly',  label: 'Weekly',  emoji: '📅', title: 'Weekly Summary Digest' },
  { id: 'monthly', label: 'Monthly', emoji: '📊', title: 'Monthly Recap' },
  { id: 'yearly',  label: 'Yearly',  emoji: '🏆', title: 'Annual Chronicle' },
];

// Window boundary for each cycle, computed against `now` in local time.
function windowStart(cycle, now = new Date()) {
  const d = new Date(now);
  switch (cycle) {
    case 'daily':
      d.setHours(0, 0, 0, 0);
      return d;
    case 'weekly': {
      const day = d.getDay(); // 0=Sun
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'monthly':
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'yearly':
      return new Date(d.getFullYear(), 0, 1);
    default:
      return new Date(0);
  }
}

function formatWindow(cycle, now = new Date()) {
  const start = windowStart(cycle, now);
  const opts = { month: 'long', day: 'numeric', year: 'numeric' };
  if (cycle === 'daily') return now.toLocaleDateString(undefined, { weekday: 'long', ...opts });
  if (cycle === 'weekly') return `${start.toLocaleDateString(undefined, opts)} — ${now.toLocaleDateString(undefined, opts)}`;
  if (cycle === 'monthly') return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return String(now.getFullYear());
}

// Compute cycle-level facts from real media items. Only returns counts and
// samples derived from the user's own data. Nothing fabricated.
function summarizeForCycle(timeline, cycle) {
  if (!timeline) return null;
  const buckets = [
    ...(timeline.familyJourney || []),
    ...(timeline.travelHistory || []),
    ...(timeline.childGrowth || []),
    ...(timeline.relationship || []),
    ...(timeline.petTimeline || []),
    ...(timeline.onThisDay || []),
  ];
  // De-dup by media id.
  const byId = new Map();
  for (const m of buckets) if (m?.id) byId.set(m.id, m);
  const all = [...byId.values()];

  const start = windowStart(cycle).getTime();
  const inWindow = all.filter((m) => {
    const t = new Date(m.createdAt || 0).getTime();
    return t >= start;
  });

  // Aggregate real signals ONLY: media count, distinct places from AI location tags,
  // distinct auto-albums observed, and the newest few media as highlights.
  const places = new Set();
  const albums = new Set();
  for (const m of inWindow) {
    const locs = m.aiAnalysis?.locations || [];
    for (const l of locs) if (l) places.add(String(l).toLowerCase());
    if (m.aiAnalysis?.autoAlbum) albums.add(m.aiAnalysis.autoAlbum);
  }

  const highlights = inWindow
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  return {
    total: inWindow.length,
    places: places.size,
    albums: albums.size,
    highlights,
  };
}

// ---- UI primitives -------------------------------------------------------

function StatTile({ icon: Icon, label, value, color }) {
  return (
    <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-1">
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center mx-auto"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-[10px] text-white/45 block font-semibold">{label}</span>
      <span className="text-lg font-black text-white">{value}</span>
    </div>
  );
}

// Decorative feature illustration — no user content implied. Pure CSS/SVG.
function JournalIllustration() {
  return (
    <div
      className="relative h-48 md:h-56 rounded-3xl border border-white/10 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-pink-500/12 via-fuchsia-500/8 to-purple-500/12" />
      <div className="absolute inset-0 opacity-40" style={{
        backgroundImage:
          'radial-gradient(circle at 20% 30%, rgba(236,72,153,0.28), transparent 40%),' +
          'radial-gradient(circle at 80% 70%, rgba(139,92,246,0.28), transparent 40%)',
      }} />
      <svg viewBox="0 0 400 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="pageGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
        </defs>
        <g transform="translate(90,40)">
          <rect x="0" y="0" width="220" height="130" rx="14" fill="url(#pageGrad)" stroke="rgba(255,255,255,0.16)" />
          <rect x="14" y="18" width="150" height="6" rx="3" fill="rgba(255,255,255,0.16)" />
          <rect x="14" y="34" width="180" height="4" rx="2" fill="rgba(255,255,255,0.10)" />
          <rect x="14" y="46" width="120" height="4" rx="2" fill="rgba(255,255,255,0.10)" />
          <rect x="14" y="58" width="164" height="4" rx="2" fill="rgba(255,255,255,0.10)" />
          <rect x="14" y="70" width="90"  height="4" rx="2" fill="rgba(255,255,255,0.10)" />
          <g transform="translate(150,90)">
            <circle cx="0" cy="0" r="4" fill="#ec4899" />
            <circle cx="14" cy="0" r="4" fill="#a855f7" />
            <circle cx="28" cy="0" r="4" fill="#06b6d4" />
          </g>
        </g>
      </svg>
    </div>
  );
}

// ---- Page ---------------------------------------------------------------

export default function JournalPage() {
  const [activeCycle, setActiveCycle] = useState('monthly');
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [timeline, setTimeline] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/memories/timeline');
      setTimeline(data || {});
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
      toast.success('Journal refreshed');
    } catch {
      // load() sets error state internally
    } finally {
      setRefreshing(false);
    }
  };

  const cycleMeta = CYCLES.find((c) => c.id === activeCycle) || CYCLES[2];
  const summary = status === 'ready' ? summarizeForCycle(timeline, activeCycle) : null;
  const hasContent = summary && summary.total > 0;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
            AI Life Journal
          </h1>
          <p className="text-white/60 mt-1">
            A gentle recap of your own memories, grouped by day, week, month, and year.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing || status === 'loading'}
          data-testid="journal-refresh"
          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition text-xs font-semibold text-white/85 flex items-center gap-1.5 shrink-0"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Cycle selector */}
      <div
        className="flex gap-2 overflow-x-auto bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 no-scrollbar"
        data-testid="journal-cycle-selector"
      >
        {CYCLES.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCycle(c.id)}
            data-testid={`journal-cycle-${c.id}`}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
              activeCycle === c.id
                ? 'bg-gradient-to-r from-pink-500/20 to-purple-600/25 border border-pink-500/30 text-white shadow-sm'
                : 'text-white/60 border border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="mr-1">{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeCycle}-${status}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {status === 'loading' ? (
            <JournalSkeleton />
          ) : status === 'error' ? (
            <JournalError onRetry={load} />
          ) : hasContent ? (
            <JournalReady summary={summary} cycleMeta={cycleMeta} />
          ) : (
            <JournalEmpty cycleMeta={cycleMeta} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---- States -------------------------------------------------------------

function JournalSkeleton() {
  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-8" data-testid="journal-loading">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6">
        <div className="h-6 w-64 rounded bg-white/[0.06] animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
              <div className="h-8 w-8 rounded-full bg-white/[0.06] animate-pulse mx-auto" />
              <div className="h-3 w-20 rounded bg-white/[0.06] animate-pulse mx-auto" />
              <div className="h-5 w-10 rounded bg-white/[0.06] animate-pulse mx-auto" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-white/[0.06] animate-pulse" />
          <div className="h-3 w-full rounded bg-white/[0.06] animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-white/[0.06] animate-pulse" />
        </div>
      </div>
      <div className="space-y-6">
        <div className="h-40 rounded-3xl bg-white/[0.02] border border-white/5 animate-pulse" />
        <div className="h-40 rounded-3xl bg-white/[0.02] border border-white/5 animate-pulse" />
      </div>
    </div>
  );
}

function JournalError({ onRetry }) {
  return (
    <div
      className="rounded-3xl border border-rose-400/25 bg-rose-500/[0.06] p-8 flex flex-col items-center text-center gap-3"
      data-testid="journal-error"
    >
      <div className="h-12 w-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
        <AlertTriangle className="h-5 w-5 text-rose-300" />
      </div>
      <h2 className="text-lg font-semibold text-white">Something went wrong while loading your journal.</h2>
      <p className="text-sm text-white/60 max-w-md">
        We couldn&apos;t reach your memories right now. Please try again in a moment.
      </p>
      <button
        onClick={onRetry}
        data-testid="journal-retry"
        className="mt-2 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold flex items-center gap-1.5"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}

function JournalEmpty({ cycleMeta }) {
  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-8" data-testid="journal-empty">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6">
        <JournalIllustration />
        <div className="space-y-2 text-center">
          <span className="text-[10px] uppercase font-bold text-pink-300 tracking-wider">
            {cycleMeta.title}
          </span>
          <h2 className="text-2xl font-black text-white">No journal stories yet</h2>
          <p className="text-sm text-white/70 max-w-md mx-auto leading-relaxed">
            Start by capturing a thought, adding a memory, or asking SnapNext to help shape your first story.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Link
            href="/dashboard"
            data-testid="journal-empty-capture"
            className="px-4 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 hover:opacity-95 transition text-xs font-semibold text-white inline-flex items-center gap-1.5"
          >
            <PenTool className="h-3.5 w-3.5" /> Capture a thought
          </Link>
          <Link
            href="/upload"
            data-testid="journal-empty-add-memory"
            className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition text-xs font-semibold text-white inline-flex items-center gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" /> Add a memory
          </Link>
          <Link
            href="/chat"
            data-testid="journal-empty-ask-ai"
            className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition text-xs font-semibold text-white inline-flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" /> Ask SnapNext
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
          <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1">
            <BookOpen className="h-4 w-4 text-pink-300" /> How the journal will work
          </h3>
          <p className="text-xs text-white/65 leading-relaxed">
            As you upload photos and videos, SnapNext quietly organises them into daily, weekly,
            monthly, and yearly recaps built entirely from your own memories.
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
          <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1.5">
            <Heart className="h-4 w-4 text-pink-400" /> Your privacy
          </h3>
          <p className="text-xs text-white/65 leading-relaxed">
            The journal only uses your own media. Nothing here is generated from other users&apos; content,
            and no memory is shared without your explicit permission.
          </p>
        </div>
      </div>
    </div>
  );
}

function JournalReady({ summary, cycleMeta }) {
  const highlights = summary.highlights || [];
  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-8" data-testid="journal-ready">
      {/* Main recap */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex justify-between items-start border-b border-white/10 pb-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-pink-300 tracking-wider">SnapNext Recap</span>
              <h2 className="text-xl md:text-2xl font-black text-white mt-1">{cycleMeta.title}</h2>
            </div>
            <span className="text-xs text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full font-medium">
              {formatWindow(cycleMeta.id)}
            </span>
          </div>

          {/* Real stats derived from user's own media */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile icon={BookOpen} label="Memories in this window" value={summary.total} color="#f43f5e" />
            <StatTile icon={MapPin}   label="Places recognised"       value={summary.places} color="#3b82f6" />
            <StatTile icon={Users}    label="Auto-albums touched"      value={summary.albums} color="#a855f7" />
            <StatTile icon={Star}     label="Highlights ready"         value={highlights.length} color="#ec4899" />
          </div>

          {/* Truthful description — no fabricated narrative */}
          <div className="space-y-2">
            <h3 className="text-xs uppercase font-bold text-white/40 tracking-wider flex items-center gap-1">
              <PenTool className="h-3.5 w-3.5 text-pink-300" /> This window in summary
            </h3>
            <p className="text-sm text-white/85 leading-relaxed">
              You captured {summary.total} {summary.total === 1 ? 'memory' : 'memories'} in this window
              {summary.places > 0 ? `, across ${summary.places} recognised ${summary.places === 1 ? 'place' : 'places'}` : ''}
              {summary.albums > 0 ? `, spanning ${summary.albums} ${summary.albums === 1 ? 'auto-album' : 'auto-albums'}` : ''}.
              {' '}Open a memory to see it, or head to{' '}
              <Link href="/memories" className="text-pink-300 hover:underline">Memories</Link>{' '}for the full timeline.
            </p>
          </div>
        </div>

        <div className="text-[10px] text-white/30 border-t border-white/5 pt-4">
          Recap generated from your own uploaded media. Nothing outside your library is shown here.
        </div>
      </div>

      {/* Highlights sidebar */}
      <div className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
          <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1">
            <Flame className="h-4 w-4 text-orange-400" /> Recent highlights
          </h3>
          {highlights.length === 0 ? (
            <p className="text-xs text-white/55">No highlights in this window yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2" data-testid="journal-highlights">
              {highlights.map((m) => (
                <div
                  key={m.id}
                  className="relative aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/5"
                >
                  {m.kind === 'video' ? (
                    <video src={mediaSrc(m.id)} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={mediaSrc(m.id)} className="h-full w-full object-cover" alt="" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
          <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1.5">
            <Heart className="h-4 w-4 text-pink-400" /> Next step
          </h3>
          <p className="text-xs text-white/65 leading-relaxed">
            Keep the recap honest by continuing to back up new moments as they happen.
          </p>
          <Link
            href="/upload"
            data-testid="journal-ready-add-memory"
            className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition text-xs font-semibold text-white"
          >
            Back up new photos <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
