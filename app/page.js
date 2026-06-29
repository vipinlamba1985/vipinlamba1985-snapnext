'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Brain, Check, Pause, Play, Search, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { motion } from 'framer-motion';

const HERO_VIDEO = '/snapnext-hero.mp4';

const featureCards = [
  ['AI Search', 'Find people, trips, documents, and memories in seconds.', Search],
  ['Private Backup', 'Keep your digital life protected and easy to recover.', ShieldCheck],
  ['Family Sharing', 'Share meaningful moments with the people who matter.', Users],
];

export default function MarketingLandingPage() {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);

  const toggleVideo = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      await video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05020b] text-white selection:bg-pink-500 selection:text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-pink-300">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-950/30">
              <Brain className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-black tracking-tight">SnapNext AI</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Life OS</div>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-white/70 transition hover:text-white">Log in</Link>
            <Link href="/signup" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black shadow-lg shadow-white/10 transition hover:-translate-y-0.5 hover:bg-pink-100">Start Free</Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-screen overflow-hidden px-5 pt-28 sm:px-6 lg:pt-32">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover opacity-70"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/snapnext-hero-poster.jpg"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,0.22),transparent_34%),linear-gradient(90deg,rgba(5,2,11,0.96),rgba(5,2,11,0.58)_45%,rgba(5,2,11,0.9))]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#05020b] to-transparent" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-8rem)] max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }} className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" /> Video hero test
            </div>
            <h1 className="text-5xl font-black leading-[0.92] tracking-[-0.055em] text-white sm:text-7xl lg:text-8xl">
              Your digital life,
              <span className="mt-2 block bg-gradient-to-r from-cyan-200 via-blue-200 to-purple-200 bg-clip-text text-transparent">organized by AI.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/72 sm:text-xl">
              SnapNext keeps your photos, videos, documents, stories, and family memories beautifully protected, searchable, and ready to share.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-purple-500 px-7 py-4 font-black text-white shadow-2xl shadow-cyan-950/30 transition duration-300 hover:-translate-y-1 hover:shadow-cyan-400/20">
                Start Free <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <button onClick={toggleVideo} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-7 py-4 font-bold text-white backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/15">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />} {isPlaying ? 'Pause Video' : 'Play Video'}
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} className="hidden lg:block">
            <div className="rounded-[2.2rem] border border-white/15 bg-black/35 p-4 shadow-2xl shadow-blue-950/30 backdrop-blur-xl">
              <div className="aspect-video overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/50">
                <video className="h-full w-full object-cover" autoPlay muted loop playsInline preload="metadata" poster="/snapnext-hero-poster.jpg">
                  <source src={HERO_VIDEO} type="video/mp4" />
                </video>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {featureCards.map(([title, text, Icon]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <Icon className="h-5 w-5 text-cyan-200" />
                    <h3 className="mt-4 font-black text-white">{title}</h3>
                    <p className="mt-2 text-xs leading-5 text-white/55">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative z-10 px-5 py-14 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Remember Everything', 'A calm home for your memories, documents, and stories.'],
              ['Find Anything', 'Search by people, places, dates, events, and meaning.'],
              ['Share Beautifully', 'Create captions, reels, and private family moments.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-xl shadow-black/20">
                <Check className="h-5 w-5 text-emerald-300" />
                <h2 className="mt-8 text-2xl font-black tracking-tight text-white">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-white/55">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
