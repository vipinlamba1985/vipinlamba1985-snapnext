'use client';
import { useEffect, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { 
  Sparkles, Heart, Calendar, Loader2, Plane, Baby, 
  Flame, Cat, ShieldAlert, Award, FileText, ArrowRight,
  BookOpen, Film, Play, Wand2
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function MemoriesPage() {
  const [timelineData, setTimelineData] = useState(null);
  const [activeTab, setActiveTab] = useState('highlights'); // highlights, family, travel, kids, love, pets
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [generatingEffect, setGeneratingEffect] = useState(false);
  const [cinematicVideo, setCinematicVideo] = useState(null);
  const [reelData, setReelData] = useState(null);
  const [generatingReel, setGeneratingReel] = useState(false);

  useEffect(() => {
    apiFetch('/memories/timeline')
      .then(setTimelineData)
      .catch(e => toast.error("Could not fetch memory timelines. Please verify you have uploaded photos."));
  }, []);

  const handleImageToVideo = async (mediaId) => {
    setGeneratingEffect(true);
    try {
      const res = await apiFetch('/ai/image-to-video', {
        method: 'POST',
        body: JSON.stringify({ mediaId })
      });
      if (res.success) {
        setCinematicVideo(res.motionEffect);
        setSelectedMedia(mediaId);
        toast.success("Premium cinematic motion successfully generated using Veo Lite!");
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGeneratingEffect(false);
    }
  };

  const handleCreateReel = async (themeName, items) => {
    setGeneratingReel(true);
    try {
      const mediaIds = items.slice(0, 8).map(i => i.id);
      const res = await apiFetch('/ai/generate-reel', {
        method: 'POST',
        body: JSON.stringify({ theme: themeName, mediaIds })
      });
      setReelData(res);
      toast.success("AI Reel Created Successfully!");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGeneratingReel(false);
    }
  };

  if (!timelineData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/50 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
        <p className="text-sm font-medium">Assembling your digital life timeline...</p>
      </div>
    );
  }

  const tabs = [
    { id: 'highlights', label: '🌟 Highlights', count: timelineData.onThisDay?.length || 0 },
    { id: 'family', label: '👨‍👩‍👧 Family', count: timelineData.familyJourney?.length || 0 },
    { id: 'travel', label: '✈️ Travel', count: timelineData.travelHistory?.length || 0 },
    { id: 'kids', label: '🍼 Kids', count: timelineData.childGrowth?.length || 0 },
    { id: 'love', label: '💕 Relationships', count: timelineData.relationship?.length || 0 },
    { id: 'pets', label: '🐾 Pets', count: timelineData.petTimeline?.length || 0 },
  ];

  const getActiveTimeline = () => {
    switch (activeTab) {
      case 'family': return timelineData.familyJourney || [];
      case 'travel': return timelineData.travelHistory || [];
      case 'kids': return timelineData.childGrowth || [];
      case 'love': return timelineData.relationship || [];
      case 'pets': return timelineData.petTimeline || [];
      default: return timelineData.onThisDay || [];
    }
  };

  const activeItems = getActiveTimeline();

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
          AI Smart Timelines
        </h1>
        <p className="text-white/60 mt-1">
          Your digital life organized, understood, and brought back to life automatically.
        </p>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2 overflow-x-auto bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 no-scrollbar">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id);
              setReelData(null);
            }}
            className={`px-4.5 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === t.id 
                ? 'bg-gradient-to-r from-pink-500/20 to-purple-600/25 border border-pink-500/30 text-white shadow-sm' 
                : 'text-white/60 border border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'highlights' ? (
          <motion.div 
            key="highlights"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            {/* Recaps Board */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-3xl border border-white/10 bg-gradient-to-b from-purple-950/20 to-transparent flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs font-semibold text-purple-300 mb-4">
                    <Sparkles className="h-3 w-3" /> Monthly Recap
                  </div>
                  <p className="text-sm text-white/85 leading-relaxed italic">
                    “{timelineData.monthlyRecap}”
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-2 text-xs text-white/50">
                  <Calendar className="h-4 w-4" /> Recapped just now
                </div>
              </div>

              <div className="p-6 rounded-3xl border border-white/10 bg-gradient-to-b from-pink-950/20 to-transparent flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-xs font-semibold text-pink-300 mb-4">
                    <Sparkles className="h-3 w-3" /> Annual life Recap
                  </div>
                  <p className="text-sm text-white/85 leading-relaxed italic">
                    “{timelineData.yearlyRecap}”
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-2 text-xs text-white/50">
                  <Calendar className="h-4 w-4" /> Comprehensive digest
                </div>
              </div>
            </div>

            {/* This Day Last Year Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-pink-400 fill-pink-400" />
                  <h2 className="text-xl font-bold">On This Day</h2>
                </div>
              </div>

              {timelineData.onThisDay?.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-10 text-center text-white/50">
                  No previous memories on this exact day. Check again tomorrow!
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {timelineData.onThisDay.map(m => (
                    <div key={m.id} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/15 bg-white/5 shadow-md hover:shadow-xl transition-all duration-300">
                      <img src={mediaSrc(m.id)} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                        <p className="text-xs text-white font-medium truncate">{m.name}</p>
                        <button 
                          onClick={() => handleImageToVideo(m.id)}
                          disabled={generatingEffect}
                          className="mt-2 text-[10px] w-full py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 font-semibold transition flex items-center justify-center gap-1"
                        >
                          {generatingEffect && selectedMedia === m.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Wand2 className="h-3 w-3" />
                          )}
                          Cinematic Zoom
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="category-timeline"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Dynamic Reel Creator Box at top of stream */}
            <div className="p-5 rounded-3xl border border-white/10 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-md font-semibold text-white flex items-center gap-2">
                  <Film className="h-4.5 w-4.5 text-pink-300" /> Auto-generate {tabs.find(t=>t.id===activeTab)?.label} Reel
                </h3>
                <p className="text-xs text-white/55 mt-1">
                  AI extracts key moments, suggests transitions, and pairs it with licensing-free music dynamically!
                </p>
              </div>
              <button
                onClick={() => handleCreateReel(activeTab, activeItems)}
                disabled={generatingReel || activeItems.length === 0}
                className="inline-flex items-center gap-2 px-4.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-40 font-semibold text-sm transition text-white shrink-0"
              >
                {generatingReel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Reel
              </button>
            </div>

            {/* Simulated interactive reel player inside timeline if generated */}
            {reelData && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 rounded-3xl border border-pink-500/25 bg-pink-950/10 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs bg-pink-500/20 text-pink-300 font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full">
                    🎬 AI Reel Studio Preview
                  </span>
                  <span className="text-xs text-white/60">
                    Transitions: {reelData.transitions?.join(' · ')}
                  </span>
                </div>
                <div className="grid md:grid-cols-[240px_1fr] gap-6">
                  {/* Left: simulated smart player */}
                  <div className="relative aspect-[9/16] max-h-[300px] rounded-2xl overflow-hidden bg-black border border-white/10 flex flex-col items-center justify-center">
                    {activeItems[0] ? (
                      <div className="absolute inset-0">
                        <img src={mediaSrc(activeItems[0].id)} alt="" className="h-full w-full object-cover animate-pulse" />
                        <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-3 text-center">
                          <p className="text-xs font-semibold text-white">{reelData.caption}</p>
                        </div>
                      </div>
                    ) : (
                      <Film className="h-10 w-10 text-white/30" />
                    )}
                    <div className="absolute bottom-3 right-3 p-2 bg-pink-500 rounded-full animate-bounce">
                      <Play className="h-4 w-4 text-white fill-white" />
                    </div>
                  </div>

                  {/* Right: details */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-md font-bold text-white">{reelData.title}</h4>
                      <p className="text-xs text-white/50 mt-1">Recommended Music Tracks:</p>
                    </div>
                    <div className="space-y-2">
                      {reelData.music?.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                          <div>
                            <p className="text-xs font-medium text-white">{m.title}</p>
                            <p className="text-[10px] text-white/40">{m.artist} · {m.genre}</p>
                          </div>
                          <span className="text-xs font-semibold text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-md">
                            {m.duration}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-16 text-center text-white/50">
                Our Core AI Brain hasn't sorted any memories into this timeline yet. Upload photos and let the vision engine classify them!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {activeItems.map((m) => (
                  <div key={m.id} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white/5 shadow-md">
                    <img src={mediaSrc(m.id)} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-500" />
                    
                    {/* Tags overlay */}
                    {m.aiAnalysis?.tags && (
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {m.aiAnalysis.tags.slice(0, 2).map((t, i) => (
                          <span key={i} className="text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Bottom overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                      <p className="text-xs text-white font-medium truncate">{m.name}</p>
                      {m.aiAnalysis?.description && (
                        <p className="text-[10px] text-white/70 line-clamp-2 mt-1">{m.aiAnalysis.description}</p>
                      )}
                      <button 
                        onClick={() => handleImageToVideo(m.id)}
                        disabled={generatingEffect}
                        className="mt-2 text-[10px] w-full py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 font-semibold transition flex items-center justify-center gap-1 text-white"
                      >
                        {generatingEffect && selectedMedia === m.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Cinematic Zoom
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Ken Burns visualizer modal for premium Image to Video */}
      {selectedMedia && cinematicVideo && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-md font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-pink-300" /> Premium Cinematic Memory Video
              </h3>
              <button 
                onClick={() => {
                  setSelectedMedia(null);
                  setCinematicVideo(null);
                }}
                className="text-white/60 hover:text-white text-xs bg-white/10 px-2.5 py-1 rounded-md"
              >
                Close
              </button>
            </div>

            {/* Breathtaking interactive Ken Burns zoom element */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
              <img 
                src={mediaSrc(selectedMedia)} 
                alt="" 
                className="h-full w-full object-cover animate-ken-burns" 
                style={{
                  animation: 'kenburns 8s ease-in-out infinite alternate'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 text-left">
                <span className="text-[10px] bg-pink-500 text-white font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider mb-1 inline-block">
                  {cinematicVideo.zoom}
                </span>
                <p className="text-xs text-white/90 font-medium">Framerate: {cinematicVideo.framerate} · Style: {cinematicVideo.vibe}</p>
              </div>
            </div>

            <p className="text-xs text-white/60 leading-relaxed text-center">
              Your childhood or family photo converted into an animated memory. Power provided by Veo Lite and Gemini.
            </p>
          </div>
        </div>
      )}

      {/* Add custom CSS injection for Ken Burns animations */}
      <style jsx global>{`
        @keyframes kenburns {
          0% {
            transform: scale(1) translate(0px, 0px);
          }
          100% {
            transform: scale(1.18) translate(-10px, -5px);
          }
        }
        .animate-ken-burns {
          animation: kenburns 8s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
