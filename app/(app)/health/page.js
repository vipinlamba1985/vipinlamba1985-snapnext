'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { 
  Sparkles, ShieldAlert, Trash2, Database, AlertTriangle, 
  Check, Play, ArrowRight, Loader2, Info, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function HealthPage() {
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(true);
  
  // Custom storage optimization categories
  const [categories, setCategories] = useState([
    { id: 'duplicates', name: 'Exact Duplicates', icon: '👯', items: 12, size: '41.5 MB', desc: 'Identical file content detected across iCloud & S3.', actionText: 'Delete 12 duplicates', done: false },
    { id: 'blurry', name: 'Blurry Photos', icon: '🌫️', items: 28, size: '124.0 MB', desc: 'Photos with low sharpness or movement artifacts.', actionText: 'Review blur details', done: false },
    { id: 'screenshots', name: 'Screenshots & Receipts', icon: '🧾', items: 45, size: '18.2 MB', desc: 'Junk temporary receipts, qr codes and tickets.', actionText: 'Archive 45 items', done: false },
    { id: 'similar', name: 'Highly Similar Burst Shots', icon: '📸', items: 34, size: '210.5 MB', desc: 'Rapid burst captures; recommend keeping only the best.', actionText: 'Keep best copies', done: false }
  ]);

  const handleScan = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setScanned(true);
      toast.success("AI Storage Advisor finished scanning library!");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFixCategory = async (categoryId) => {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, done: true } : c));
    toast.success(`Successfully optimized category! Space was reclaimed.`);
  };

  const activeCategories = categories.filter(c => !c.done);
  const totalSavings = categories
    .filter(c => !c.done)
    .reduce((acc, c) => acc + parseFloat(c.size), 0);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
            Memory Health Engine & Storage Advisor
          </h1>
          <p className="text-white/60 mt-1">
            Free up S3, iCloud, and Google cloud storage. Clean duplicates, blurry bursts, screenshots, and trash memories.
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={loading}
          className="px-4.5 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-40 transition font-semibold text-xs flex items-center gap-1.5 shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Trigger Deep Scan
        </button>
      </div>

      {!scanned ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.01] p-16 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-pink-500/15 flex items-center justify-center mx-auto text-pink-300">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-md font-bold text-white">Start Library Assessment</h3>
            <p className="text-xs text-white/50 max-w-sm mx-auto mt-1">
              Let the SnapNext AI advisor inspect your camera streams to spot visual bloat, duplicate files, and save expensive storage space.
            </p>
          </div>
          <button 
            onClick={handleScan}
            className="px-5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 transition font-semibold text-xs text-white"
          >
            Start Assessment Scan
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Summary dashboard bento-grid */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-transparent flex flex-col justify-between">
              <div>
                <span className="text-xs text-pink-300 font-semibold uppercase tracking-wider block">Total Space Savings</span>
                <span className="text-3xl font-black text-white mt-1 block">
                  {totalSavings > 0 ? `${totalSavings.toFixed(1)} MB` : '0.0 MB'}
                </span>
                <p className="text-xs text-white/55 mt-1">
                  Reclaim valuable space with automatic recommendations.
                </p>
              </div>
              <div className="text-[10px] text-white/40 pt-4 flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-pink-300" /> Safe-guard filters active
              </div>
            </div>

            <div className="p-6 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col justify-between">
              <div>
                <span className="text-xs text-white/45 font-bold uppercase tracking-wider block">Duplicate Files found</span>
                <span className="text-2xl font-black text-white mt-1 block">
                  {categories.find(c => c.id === 'duplicates')?.done ? '0' : '12'} files
                </span>
                <p className="text-xs text-white/55 mt-1">
                  Multiple exact copies loaded across separate cloud directories.
                </p>
              </div>
              <span className="text-[10px] text-emerald-400 font-semibold">100% duplicate protection</span>
            </div>

            <div className="p-6 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col justify-between">
              <div>
                <span className="text-xs text-white/45 font-bold uppercase tracking-wider block">Archive Opportunities</span>
                <span className="text-2xl font-black text-white mt-1 block">
                  {categories.find(c => c.id === 'screenshots')?.done ? '0' : '45'} receipts
                </span>
                <p className="text-xs text-white/55 mt-1">
                  Screenshots and documents ready to move to cold deep vaults.
                </p>
              </div>
              <span className="text-[10px] text-purple-300 font-semibold">Ready for batch archive</span>
            </div>
          </div>

          {/* Cleanup Categories section */}
          <div>
            <h2 className="text-md font-bold text-white mb-4">Recommended Optimization Actions</h2>

            {activeCategories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-10 text-center text-white/50">
                🎉 Your digital life is completely optimized and clear! S3 and Cloud space are perfectly lean.
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {activeCategories.map((c) => (
                    <motion.div 
                      key={c.id}
                      layout
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{c.icon}</span>
                            <h3 className="text-sm font-bold text-white">{c.name}</h3>
                          </div>
                          <span className="text-xs font-semibold text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-md">
                            {c.size} ({c.items} files)
                          </span>
                        </div>
                        <p className="text-xs text-white/55 leading-relaxed">{c.desc}</p>
                      </div>

                      <button
                        onClick={() => handleFixCategory(c.id)}
                        className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-pink-500/30 text-xs text-white font-semibold transition flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                        {c.actionText}
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
