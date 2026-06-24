'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { 
  Sparkles, RefreshCw, CloudLightning, Check, AlertCircle, 
  Trash2, Database, ShieldCheck, Play, ArrowRight, Loader2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ImportsPage() {
  const [connectors, setConnectors] = useState([
    { id: 'google_photos', name: 'Google Photos', icon: '🎨', status: 'Connected', lastSync: 'Today, 2:40 PM', files: '4,520', isSyncing: false },
    { id: 'icloud', name: 'Apple iCloud', icon: '☁️', status: 'Connected', lastSync: 'Yesterday, 8:12 AM', files: '1,240', isSyncing: false },
    { id: 'dropbox', name: 'Dropbox', icon: '📦', status: 'Disconnected', lastSync: 'Never', files: '—', isSyncing: false },
    { id: 'onedrive', name: 'Microsoft OneDrive', icon: '📂', status: 'Disconnected', lastSync: 'Never', files: '—', isSyncing: false },
    { id: 'google_drive', name: 'Google Drive', icon: '💾', status: 'Disconnected', lastSync: 'Never', files: '—', isSyncing: false }
  ]);
  const [syncLogs, setSyncLogs] = useState([
    { provider: 'Google Photos', event: 'Incremental import success', msg: 'Imported 14 new travel photos successfully. Duplicate detection filtered 3 exact hashes.', date: 'Today, 2:40 PM' },
    { provider: 'Apple iCloud', event: 'Sync completed', msg: 'Synced 1,240 existing items with full EXIF geolocation and face tag metadata preserved.', date: 'Yesterday, 8:12 AM' }
  ]);
  const [loadingProvider, setLoadingProvider] = useState(null);

  const handleConnect = async (providerId, currentStatus) => {
    if (currentStatus === 'Connected') {
      // Disconnect
      setConnectors(prev => prev.map(c => c.id === providerId ? { ...c, status: 'Disconnected', files: '—', lastSync: 'Never' } : c));
      toast.success(`Successfully disconnected ${providerId.toUpperCase().replace('_', ' ')}`);
      return;
    }

    setLoadingProvider(providerId);
    try {
      // Simulate live OAuth popup
      await new Promise(resolve => setTimeout(resolve, 1500));
      setConnectors(prev => prev.map(c => c.id === providerId ? { 
        ...c, 
        status: 'Connected', 
        files: '1,840', 
        lastSync: 'Just now' 
      } : c));
      
      setSyncLogs(prev => [
        { 
          provider: providerId.toUpperCase().replace('_', ' '), 
          event: 'Secure OAuth established', 
          msg: 'Authenticated token securely. Initialized duplicate checker and increment scanning.', 
          date: 'Just now' 
        },
        ...prev
      ]);
      toast.success(`Successfully connected ${providerId.toUpperCase().replace('_', ' ')}!`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleManualSync = async (providerId) => {
    setConnectors(prev => prev.map(c => c.id === providerId ? { ...c, isSyncing: true } : c));
    try {
      // Live simulated sync cycle
      await new Promise(resolve => setTimeout(resolve, 2000));
      setConnectors(prev => prev.map(c => c.id === providerId ? { ...c, isSyncing: false, lastSync: 'Just now' } : c));
      setSyncLogs(prev => [
        { 
          provider: providerId.toUpperCase().replace('_', ' '), 
          event: 'Incremental sync success', 
          msg: 'Successfully processed stream. No new duplicates or blurred junk files imported.', 
          date: 'Just now' 
        },
        ...prev
      ]);
      toast.success("Incremental memory sync finished!");
    } catch (e) {
      toast.error("Sync error");
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
          Multi-Cloud Memory Sync
        </h1>
        <p className="text-white/60 mt-1">
          Unify your digital life by connecting photo libraries from external cloud storage providers into a single, cohesive AI database.
        </p>
      </div>

      {/* Grid containing Providers */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {connectors.map((c) => (
          <div key={c.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{c.icon}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  c.status === 'Connected' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-white/5 text-white/50 border border-white/10'
                }`}>
                  {c.status}
                </span>
              </div>

              <div>
                <h3 className="text-md font-bold text-white">{c.name}</h3>
                <p className="text-xs text-white/50">Secure API Client Connector</p>
              </div>

              {c.status === 'Connected' && (
                <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/[0.02] p-2 rounded-xl border border-white/5">
                    <span className="text-[9px] text-white/40 font-bold block uppercase">Indexed Files</span>
                    <span className="font-bold text-white">{c.files}</span>
                  </div>
                  <div className="bg-white/[0.02] p-2 rounded-xl border border-white/5">
                    <span className="text-[9px] text-white/40 font-bold block uppercase">Last Sync</span>
                    <span className="font-semibold text-white/80 truncate block">{c.lastSync}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleConnect(c.id, c.status)}
                disabled={loadingProvider === c.id}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  c.status === 'Connected'
                    ? 'bg-red-500/15 border border-red-500/20 hover:bg-red-500/25 text-red-300'
                    : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                {loadingProvider === c.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : c.status === 'Connected' ? (
                  'Disconnect'
                ) : (
                  'Connect OAuth'
                )}
              </button>

              {c.status === 'Connected' && (
                <button
                  onClick={() => handleManualSync(c.id)}
                  disabled={c.isSyncing}
                  className="px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white transition flex items-center justify-center"
                  title="Force Sync Now"
                >
                  <RefreshCw className={`h-4.5 w-4.5 ${c.isSyncing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sync architecture insights */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Interactive Sync Settings */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
          <h3 className="text-md font-bold text-white flex items-center gap-1.5">
            <ShieldCheck className="h-5 w-5 text-pink-300" /> Incremental & Metadata Guard
          </h3>
          <p className="text-xs text-white/60">
            SnapNext runs incremental checksums and duplicate filter matching before transferring files to prevent S3 storage bloat.
          </p>

          <div className="space-y-3.5 pt-2">
            {[
              { title: "Incremental Sync", desc: "Scan only new items on cloud stream without re-downloading existing libraries.", active: true },
              { title: "Metadata & EXIF Preservation", desc: "Retain camera exposure details, original high-accuracy GPS coordinates, and face vectors.", active: true },
              { title: "Automatic Duplicate Prevention", desc: "Compare cryptographic file hashes and fuzzy visual layout matching before backup saving.", active: true },
              { title: "Junk & Screenshot Filter", desc: "Ignore receipts, blurred test frames, and visual noise automatically.", active: false }
            ].map((setting, idx) => (
              <div key={idx} className="flex items-start justify-between p-3 rounded-2xl bg-white/[0.01] border border-white/5">
                <div>
                  <h4 className="text-xs font-bold text-white">{setting.title}</h4>
                  <p className="text-[10px] text-white/50 mt-0.5 leading-relaxed">{setting.desc}</p>
                </div>
                <div className={`h-5 w-5.5 rounded-full border flex items-center justify-center ${setting.active ? 'bg-pink-500/10 border-pink-500/30 text-pink-300' : 'bg-white/5 border-white/10 text-white/30'}`}>
                  {setting.active && <Check className="h-3 w-3" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Live Sync logs */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
          <h3 className="text-md font-bold text-white">Live Connection Logs</h3>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1.5 no-scrollbar">
            {syncLogs.map((log, idx) => (
              <div key={idx} className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="font-bold text-white/40">{log.provider}</span>
                  <span className="text-white/35 font-semibold">{log.date}</span>
                </div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-pink-400"></span>
                  {log.event}
                </h4>
                <p className="text-[10px] text-white/65 leading-relaxed">{log.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
