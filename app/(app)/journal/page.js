'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Sparkles, BookOpen, Calendar, MapPin, Heart, Users,
  Loader2, Star, PenTool, ImagePlus, Film, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CYCLES = [
  { id: 'daily', label: 'Daily Journal' },
  { id: 'weekly', label: 'Weekly Digest' },
  { id: 'monthly', label: 'Monthly Recap' },
  { id: 'yearly', label: 'Annual Chronicle' },
];

const CYCLE_TITLES = {
  daily: "Today's Journal",
  weekly: 'This Week in Your Life',
  monthly: 'This Month in Your Life',
  yearly: 'Your Year So Far',
};

function formatRange(range) {
  if (!range?.start) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = new Date(range.start).toLocaleDateString('en-US', opts);
  const end = new Date(range.end).toLocaleDateString('en-US', opts);
  return start === end ? start : `${start} – ${end}`;
}

export default function JournalPage() {
  const [activeCycle, setActiveCycle] = useState('monthly');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState(null);

  const loadSummary = useCallback(async (cycle) => {
    setLoading(true);
    setError(null);
    setNarrative(null);
    setNarrativeError(null);
    try {
      const data = await apiFetch(`/journal/summary?cycle=${cycle}`);
      setSummary(data);
    } catch (e) {
      setError(e?.message || 'Could not load your journal right now.');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(activeCycle);
  }, [activeCycle, loadSummary]);

  const handleNarrative = async () => {
    setNarrativeLoading(true);
    setNarrativeError(null);
    try {
      const data = await apiFetch('/journal/narrative', {
        method: 'POST',
        body: JSON.stringify({ cycle: activeCycle }),
      });
      setNarrative(typeof data?.narrative === 'string' ? data.narrative : null);
      if (!data?.narrative) setNarrativeError('The AI narrative came back empty. Please try again.');
    } catch (e) {
      setNarrativeError(e?.message || 'AI narrative is unavailable right now.');
    } finally {
      setNarrativeLoading(false);
    }
  };

  const stats = summary?.stats;
  const hasMemories = (stats?.memories || 0) > 0;

  const statTiles = [];
  if (stats) {
    statTiles.push({ label: 'Memories saved', value: stats.memories, icon: BookOpen, color: '#f43f5e' });
    statTiles.push({ label: 'Photos', value: stats.photos, icon: ImagePlus, color: '#3b82f6' });
    statTiles.push({ label: 'Videos', value: stats.videos, icon: Film, color: '#a855f7' });
    statTiles.push({ label: 'Favorites', value: stats.favorites, icon: Star, color: '#ec4899' });
    // Only show sections the backend can genuinely support with real data.
    if (stats.locations > 0) statTiles.push({ label: 'Places detected', value: stats.locations, icon: MapPin, color: '#06b6d4' });
    if (stats.people > 0) statTiles.push({ label: 'People detected', value: stats.people, icon: Users, color: '#10b981' });
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
            Life Journal
          </h1>
          <p className="text-white/60 mt-1">
            A truthful journal built from the memories you actually save. Nothing here is invented.
          </p>
        </div>
        <button
          onClick={() => loadSummary(activeCycle)}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition font-semibold text-xs text-white flex items-center gap-1.5 shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 no-scrollbar">
        {CYCLES.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCycle(c.id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
              activeCycle === c.id
                ? 'bg-gradient-to-r from-pink-500/20 to-purple-600/25 border border-pink-500/30 text-white shadow-sm'
                : 'text-white/60 border border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid md:grid-cols-[1fr_360px] gap-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 space-y-4 animate-pulse">
            <div className="h-6 w-56 rounded bg-white/10" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/5" />)}
            </div>
            <div className="h-20 rounded-2xl bg-white/5" />
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 h-64 animate-pulse" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 text-center space-y-3">
          <p className="text-sm text-white/70">{error}</p>
          <button
            onClick={() => loadSummary(activeCycle)}
            className="px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && !hasMemories && (
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-10 md:p-14 text-center space-y-4">
          {/* Decorative product visual — clearly not user data */}
          <div className="mx-auto h-16 w-16 rounded-2xl bg-pink-500/10 border border-pink-500/20 grid place-items-center">
            <PenTool className="h-7 w-7 text-pink-300" />
          </div>
          <h2 className="text-xl font-bold text-white">No memories in this period yet</h2>
          <p className="text-sm text-white/60 max-w-md mx-auto">
            Your {activeCycle} journal is written from photos and videos you actually back up.
            Once you save memories, this page fills with your real story — never an invented one.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold transition"
          >
            <ImagePlus className="h-4 w-4" /> Back up photos and videos
          </Link>
        </div>
      )}

      {!loading && !error && hasMemories && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCycle}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid md:grid-cols-[1fr_360px] gap-8"
          >
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-white/10 pb-4 gap-3 flex-wrap">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-pink-300 tracking-wider">
                      From your real library
                    </span>
                    <h2 className="text-xl md:text-2xl font-black text-white mt-1">
                      {CYCLE_TITLES[activeCycle]}
                    </h2>
                  </div>
                  <span className="text-xs text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full font-medium">
                    {formatRange(summary?.range)}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {statTiles.map((stat, idx) => (
                    <div key={idx} className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-1">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
                        <stat.icon className="h-4 w-4" />
                      </div>
                      <span className="text-[10px] text-white/45 block font-semibold">{stat.label}</span>
                      <span className="text-lg font-black text-white">{stat.value}</span>
                    </div>
                  ))}
                </div>

                {summary?.topTags?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs uppercase font-bold text-white/40 tracking-wider">Themes in your memories</h3>
                    <div className="flex flex-wrap gap-2">
                      {summary.topTags.map((t) => (
                        <span key={t.tag} className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70">
                          {t.tag} <span className="text-white/40">×{t.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-xs uppercase font-bold text-white/40 tracking-wider flex items-center gap-1">
                    <PenTool className="h-3.5 w-3.5 text-pink-300" /> AI narrative (grounded in your saved memories)
                  </h3>
                  {narrative ? (
                    <p className="text-sm text-white/85 leading-relaxed font-serif italic text-justify">
                      “{narrative}”
                    </p>
                  ) : (
                    <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 space-y-3">
                      <p className="text-xs text-white/50">
                        Generate a short narrative written only from the memories listed above.
                        SnapNext AI never invents people, places, or events.
                      </p>
                      {narrativeError && <p className="text-xs text-amber-300/90">{narrativeError}</p>}
                      <button
                        onClick={handleNarrative}
                        disabled={narrativeLoading}
                        className="px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        {narrativeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {narrativeError ? 'Try again' : 'Write my narrative'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-white/30 border-t border-white/5 pt-4">
                Every number and highlight on this page is computed from your own saved media.
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
                <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-pink-400" /> Highlights from this period
                </h3>
                {summary?.highlights?.length > 0 ? (
                  <div className="space-y-3">
                    {summary.highlights.map((h) => (
                      <div key={h.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          {h.kind === 'photo' && mediaSrc(h.id) ? (
                            <img
                              src={mediaSrc(h.id)}
                              alt={h.name || 'Memory'}
                              className="h-10 w-10 rounded-lg object-cover border border-white/10"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 grid place-items-center">
                              {h.kind === 'video' ? <Film className="h-4 w-4 text-white/40" /> : <ImagePlus className="h-4 w-4 text-white/40" />}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{h.name || 'Memory'}</p>
                            <p className="text-[10px] text-white/40 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {h.isFavorite && <Star className="h-3 w-3 text-amber-300" />}
                            </p>
                          </div>
                        </div>
                        {h.description && (
                          <p className="text-[11px] text-white/60 leading-relaxed">{h.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/50 leading-relaxed">
                    Favorite a memory or let AI analysis finish to see highlights here.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
