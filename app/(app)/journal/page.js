'use client';
import { useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { 
  Sparkles, BookOpen, Calendar, MapPin, Heart, Users,
  Loader2, Star, ChevronLeft, ChevronRight, PenTool, Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function JournalPage() {
  const [activeCycle, setActiveCycle] = useState('monthly'); // daily, weekly, monthly, yearly
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Dynamic journal databases
  const journals = {
    daily: {
      title: "Today's Living Journal",
      date: "Tuesday, June 23, 2026",
      stats: { memories: 12, locations: 1, people: 4, albums: 1 },
      narrative: "You captured some quiet, peaceful highlights today. The afternoon was punctuated by a brief outdoor walk near Mumbai Marina where you took high-contrast sunset reflections. Sarika lamba was tagged in 3 memories, reflecting a highly joyful affinity. You archived these milestones into your ongoing 'Summer 2026' travel library.",
      milestones: ["Sunset Marina walk", "Indexed 3 new photos with Sarika", "Archived 1 voice recording memo"],
      highlights: ["Sunset reflections near Marina", "Sarika's joyful smile during coffee break"]
    },
    weekly: {
      title: "Weekly Summary Digest",
      date: "June 15 – June 22, 2026",
      stats: { memories: 47, locations: 2, people: 8, albums: 2 },
      narrative: "This past week was centered around family reunions and beautiful child development milestones. Aarav lamba spent quality time with his grandparents in the garden, generating 15 highly aesthetic memories. On Thursday, you enjoyed a peaceful dinner with family, preserving precious laughter and candid speech transcripts.",
      milestones: ["Grandparents reunion photoshoot", "Aarav's garden growth milestones", "Family dinner transcript indexing"],
      highlights: ["Aarav riding his toy bicycle", "Warm evening laughing at the dinner table"]
    },
    monthly: {
      title: "June 2026 Life Journal",
      date: "June 1 – June 23, 2026",
      stats: { memories: 147, locations: 4, people: 18, albums: 3 },
      narrative: "An incredible month filled with travel, emotional landmarks, and memory preservation. You visited 4 primary locations—centering around Goa beaches and Mumbai cityscapes—and spent meaningful moments with 18 of your favorite people. Your emotional pulse was overwhelmingly positive, with 'joyful' and 'serene' being the most common mood signatures extracted by our Gemini analysis engine.",
      milestones: ["Goa Beach vacation highlights", "Joint timeline initialized with Sarika", "Aarav height tracker updated"],
      highlights: ["Scenic drone shot of the Goa coast", "Sarika and Aarav holding hands in the waves", "Aarav playing with beach buckets"]
    },
    yearly: {
      title: "Year 2026 Legacy Chronicle",
      date: "January – June 2026 Year-to-Date",
      stats: { memories: 1240, locations: 12, people: 34, albums: 14 },
      narrative: "Your year has been defined by incredible steps forward in relationships, healthy habits, and digital preservation. With 1,240 total items securely saved across S3, iCloud, and Google Photos, SnapNext has created a robust legacy vault of your family's life. You traveled to 12 cities and spent critical moments with Aarav, Sarika, and your parents. There are 24 active milestones indexed under family growth.",
      milestones: ["Major Dubai summer holiday storybook", "Anniversary timeline complete", "Core backup migration finished"],
      highlights: ["Sunset at the Burj Khalifa, Dubai", "Family gathering birthday cake celebration", "Aarav's first day of school photo"]
    }
  };

  const currentJournal = journals[activeCycle];

  const handleRebuild = async () => {
    setLoading(true);
    try {
      // Simulate robust Gemini content extraction
      await new Promise(resolve => setTimeout(resolve, 2200));
      toast.success("AI Life Journal re-analyzed & updated successfully!");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
            AI Life Journal
          </h1>
          <p className="text-white/60 mt-1">
            An elegant, fully automated journal summarizing your daily life, memories, and personal stories.
          </p>
        </div>

        <button
          onClick={handleRebuild}
          disabled={loading}
          className="px-4.5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-40 transition font-semibold text-xs text-white flex items-center gap-1.5 shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Re-Analyze Library
        </button>
      </div>

      {/* Cycle selector buttons */}
      <div className="flex gap-2 overflow-x-auto bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 no-scrollbar">
        {[
          { id: 'daily', label: '📖 Daily Journal' },
          { id: 'weekly', label: '📅 Weekly Digest' },
          { id: 'monthly', label: '📊 Monthly Recap' },
          { id: 'yearly', label: '🏆 Annual Chronicle' }
        ].map(c => (
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

      <AnimatePresence mode="wait">
        <motion.div
          key={activeCycle}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="grid md:grid-cols-[1fr_360px] gap-8"
        >
          {/* Main Journal Editorial Page */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-pink-300 tracking-wider">
                    SnapNext AI Memoir
                  </span>
                  <h2 className="text-xl md:text-2xl font-black text-white mt-1">
                    {currentJournal.title}
                  </h2>
                </div>
                <span className="text-xs text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full font-medium">
                  {currentJournal.date}
                </span>
              </div>

              {/* Quick statistics bento tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Memories Created", value: currentJournal.stats.memories, icon: BookOpen, color: '#f43f5e' },
                  { label: "Locations Visited", value: currentJournal.stats.locations, icon: MapPin, color: '#3b82f6' },
                  { label: "People Seen", value: currentJournal.stats.people, icon: Users, color: '#a855f7' },
                  { label: "New Albums Built", value: currentJournal.stats.albums, icon: Star, color: '#ec4899' }
                ].map((stat, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-1">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] text-white/45 block font-semibold">{stat.label}</span>
                    <span className="text-lg font-black text-white">{stat.value}</span>
                  </div>
                ))}
              </div>

              {/* Narrative block */}
              <div className="space-y-2">
                <h3 className="text-xs uppercase font-bold text-white/40 tracking-wider flex items-center gap-1">
                  <PenTool className="h-3.5 w-3.5 text-pink-300" /> AI Generated Narrative
                </h3>
                <p className="text-sm text-white/85 leading-relaxed font-serif italic text-justify">
                  “{currentJournal.narrative}”
                </p>
              </div>
            </div>

            <div className="text-[10px] text-white/30 border-t border-white/5 pt-4">
              Generated by Gemini Core Brain. Synced across all connected multi-cloud archives.
            </div>
          </div>

          {/* Highlights & milestones sidebar */}
          <div className="space-y-6">
            {/* Milestones list */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
              <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1">
                <Flame className="h-4 w-4 text-orange-400" /> Key Milestones Discovered
              </h3>
              <div className="space-y-3">
                {currentJournal.milestones.map((milestone, idx) => (
                  <div key={idx} className="flex gap-3 items-start text-xs text-white/80">
                    <span className="h-5 w-5 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center font-bold text-pink-300 shrink-0">
                      {idx + 1}
                    </span>
                    <p className="pt-0.5 leading-relaxed">{milestone}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Emotional Highlights list */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
              <h3 className="text-xs uppercase font-bold text-white/45 tracking-wider flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-pink-400" /> Emotional Highlights
              </h3>
              <div className="space-y-3">
                {currentJournal.highlights.map((h, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-white/70 leading-relaxed">
                    {h}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
