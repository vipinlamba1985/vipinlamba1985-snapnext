'use client';
import Link from 'next/link';
import { CloudLightning, Info, ImagePlus, ShieldCheck } from 'lucide-react';

// TRUTHFULNESS: external cloud connectors (Google Photos, iCloud, Dropbox,
// OneDrive, Google Drive) are NOT implemented in the backend yet. This page
// must never simulate OAuth connections, fake sync logs, or invented file
// counts. Until real connectors ship, we state that clearly and route users
// to the upload flow that genuinely works.
const PROVIDERS = [
  { id: 'google_photos', name: 'Google Photos', icon: '🖼️' },
  { id: 'icloud', name: 'Apple iCloud', icon: '☁️' },
  { id: 'dropbox', name: 'Dropbox', icon: '📦' },
  { id: 'onedrive', name: 'Microsoft OneDrive', icon: '📂' },
  { id: 'google_drive', name: 'Google Drive', icon: '💾' },
];

export default function ImportsPage() {
  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
          Cloud Imports
        </h1>
        <p className="text-white/60 mt-1">
          Bring photo libraries from other cloud services into SnapNext.
        </p>
      </div>

      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-sky-300 mt-0.5 shrink-0" />
        <div className="text-xs text-sky-200/80 leading-relaxed">
          <p className="font-semibold text-sky-200">Cloud connectors are coming soon.</p>
          <p className="mt-1">
            Direct imports from these services are not available yet — SnapNext will never show a
            fake connection. Today, the reliable way to protect your memories is the upload flow below.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PROVIDERS.map((p) => (
          <div key={p.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{p.icon}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-white/5 text-white/50 border border-white/10">
                  Coming soon
                </span>
              </div>
              <div>
                <h3 className="text-md font-bold text-white">{p.name}</h3>
                <p className="text-xs text-white/50">Not yet available</p>
              </div>
            </div>
            <button
              disabled
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 text-xs font-semibold cursor-not-allowed"
              title="This integration is not available yet"
            >
              Connect (coming soon)
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-pink-500/10 border border-pink-500/20 grid place-items-center">
          <CloudLightning className="h-6 w-6 text-pink-300" />
        </div>
        <h2 className="text-lg font-bold text-white">Back up your memories today</h2>
        <p className="text-sm text-white/60 max-w-md mx-auto">
          Export your photos from any service to your device, then upload them here.
          SnapNext deduplicates files automatically, so re-uploading is always safe.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/upload" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold transition">
            <ImagePlus className="h-4 w-4" /> Upload photos and videos
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-white/40">
            <ShieldCheck className="h-3.5 w-3.5" /> Duplicate-safe uploads
          </span>
        </div>
      </div>
    </div>
  );
}
