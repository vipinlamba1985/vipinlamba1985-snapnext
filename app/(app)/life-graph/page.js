'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import Link from 'next/link';
import {
  Users, MapPin, Loader2, ImagePlus, RefreshCw, Sparkles, Network, Info
} from 'lucide-react';
import { motion } from 'framer-motion';

// Life Graph — grounded in the authenticated user's real media analysis only.
// People come from AI-detected roles in the user's own analyzed photos.
// Places come from AI-detected locations in the user's own analyzed photos.
// If no analysis data exists, we show truthful empty states — never invented
// family members, trips, or counts.
export default function LifeGraphPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [people, setPeople] = useState([]);
  const [places, setPlaces] = useState([]);
  const [mediaCount, setMediaCount] = useState(0);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [recentAnalyzed, setRecentAnalyzed] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [favAi, mediaRes] = await Promise.all([
        apiFetch('/favorites/ai').catch(() => null),
        apiFetch('/media').catch(() => null),
      ]);

      const items = mediaRes?.items || mediaRes?.media || [];
      setMediaCount(items.length);

      const analyzed = items.filter((m) => m?.aiAnalysis?.description || (m?.aiAnalysis?.tags || []).length > 0);
      setAnalyzedCount(analyzed.length);
      setRecentAnalyzed(analyzed.slice(0, 8));

      // Real people signals (generic roles detected by vision analysis)
      setPeople(Array.isArray(favAi?.favoritePeople) ? favAi.favoritePeople.slice(0, 12) : []);

      // Real place signals from analyzed media only
      const placeCounts = {};
      for (const m of items) {
        for (const loc of (m?.aiAnalysis?.locations || [])) {
          const key = String(loc).trim();
          if (key) placeCounts[key] = (placeCounts[key] || 0) + 1;
        }
      }
      setPlaces(
        Object.entries(placeCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12)
      );
    } catch (e) {
      setError(e?.message || 'Could not load your life graph right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
            Life Graph
          </h1>
          <p className="text-white/60 mt-1">
            People and places detected in your own analyzed memories. Built only from real data.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition font-semibold text-xs text-white flex items-center gap-1.5 shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {loading && (
        <div className="grid md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 h-48 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 text-center space-y-3">
          <p className="text-sm text-white/70">{error}</p>
          <button onClick={load} className="px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && mediaCount === 0 && (
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-10 md:p-14 text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 grid place-items-center">
            <Network className="h-7 w-7 text-purple-300" />
          </div>
          <h2 className="text-xl font-bold text-white">Your life graph starts with your first backup</h2>
          <p className="text-sm text-white/60 max-w-md mx-auto">
            When you back up photos and videos, SnapNext AI detects the people, places, and themes
            that actually appear in them — and maps them here. Nothing is ever invented.
          </p>
          <Link href="/upload" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold transition">
            <ImagePlus className="h-4 w-4" /> Back up photos and videos
          </Link>
        </div>
      )}

      {!loading && !error && mediaCount > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {analyzedCount === 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
              <Info className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200/80 leading-relaxed">
                You have {mediaCount} {mediaCount === 1 ? 'memory' : 'memories'} saved, but AI analysis
                has not produced results for them yet. People and places appear here once analysis is available.
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* People — only real detected roles */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
              <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-400" /> People in your memories
              </h3>
              {people.length > 0 ? (
                <div className="space-y-2">
                  {people.map((p) => (
                    <div key={p.name} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-sm text-white/85 font-medium capitalize">{p.name}</span>
                      <span className="text-xs text-white/45">{p.count} {p.count === 1 ? 'memory' : 'memories'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/50 leading-relaxed">
                  No people detected in your analyzed memories yet. As AI analysis runs on your
                  uploads, the people who appear in them are grouped here.
                </p>
              )}
            </div>

            {/* Places — only real detected locations */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
              <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-sky-400" /> Places in your memories
              </h3>
              {places.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {places.map((p) => (
                    <span key={p.name} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/75">
                      {p.name} <span className="text-white/40">×{p.count}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/50 leading-relaxed">
                  No places detected yet. When AI analysis can genuinely identify a place or landmark
                  in your photos, it appears here — we never guess locations.
                </p>
              )}
            </div>
          </div>

          {/* Recently analyzed memories — real thumbnails and descriptions */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
            <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-pink-400" /> Recently analyzed memories
            </h3>
            {recentAnalyzed.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {recentAnalyzed.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                    {m.kind === 'photo' && mediaSrc(m.id) ? (
                      <img src={mediaSrc(m.id)} alt={m.name || 'Memory'} className="h-24 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-24 w-full bg-white/5 grid place-items-center">
                        <ImagePlus className="h-5 w-5 text-white/30" />
                      </div>
                    )}
                    <div className="p-2.5">
                      <p className="text-[11px] text-white/70 leading-snug line-clamp-2">
                        {m.aiAnalysis?.description || m.name || 'Memory'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/50">
                Analyzed memories with AI descriptions appear here.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
