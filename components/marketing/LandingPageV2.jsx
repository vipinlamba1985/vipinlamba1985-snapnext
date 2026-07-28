'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  Check,
  Clock3,
  Cloud,
  Heart,
  Image as ImageIcon,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Users,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import BrandLogo from '@/components/BrandLogo';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-70px' },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
};

const media = {
  hero: '/hero-product.mp4',
  dashboard: '/dashboard-demo.mp4',
  assistant: '/dashboard-assistant.mp4',
};

const pricing = [
  {
    name: 'Free',
    price: '$0',
    storage: '5 GB',
    line: 'Discover what an organized digital life feels like.',
    features: ['Private memory home', 'Basic AI organization', 'Memories and search'],
    cta: 'Start Free',
  },
  {
    name: 'Starter',
    price: '$0.99',
    annual: '$9.99/year',
    storage: '15 GB',
    line: 'The easiest way to make SnapNext part of everyday life.',
    features: ['2 Favorite People', 'Smart Sync', 'Ready-to-Post AI'],
    cta: 'Choose Starter',
  },
  {
    name: 'Plus',
    price: '$3.99',
    annual: '$39.99/year',
    storage: '100 GB',
    line: 'For families and creators who want more intelligence.',
    features: ['5 Favorite People', 'Advanced AI search', 'More AI creation'],
    cta: 'Go Plus',
    featured: true,
  },
  {
    name: 'Pro',
    price: '$8.99',
    annual: '$89.99/year',
    storage: '250 GB',
    line: 'A deeper Life OS for active creators and large libraries.',
    features: ['Advanced Life AI', 'Higher AI limits', 'Priority processing'],
    cta: 'Get Pro',
  },
  {
    name: 'Family',
    price: '$14.99',
    annual: '$149.99/year',
    storage: '500 GB shared',
    line: 'One private memory home for the people who matter most.',
    features: ['Up to 5 people', 'Shared family memories', 'Pooled AI usage'],
    cta: 'Choose Family',
  },
];

function SectionHeader({ eyebrow, title, text, center = true }) {
  return (
    <motion.div {...fadeUp} className={`${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      <p className="text-xs font-black uppercase tracking-[0.26em] text-pink-300">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">{title}</h2>
      {text && <p className="mt-4 text-sm leading-6 text-white/60 sm:text-base">{text}</p>}
    </motion.div>
  );
}

function ProductFallback({ compact = false }) {
  return (
    <div className="relative h-full min-h-[280px] overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0b0614] p-4 sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(236,72,153,0.20),transparent_28%),radial-gradient(circle_at_85%_70%,rgba(34,211,238,0.12),transparent_28%)]" />
      <div className="relative mx-auto max-w-4xl rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <BrandLogo size={28} />
            <div>
              <p className="text-sm font-bold text-white">SnapNext</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Life OS</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-bold text-emerald-200">Organizing</span>
        </div>
        <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          {[
            ['34,218', 'memories indexed'],
            ['Mom', 'favorite person'],
            ['Today', 'story ready'],
          ].slice(0, compact ? 2 : 3).map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xl font-black text-white">{value}</p>
              <p className="mt-1 text-xs text-white/40">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {['Family', 'Goa', '2019'].map((item) => (
            <div key={item} className="aspect-[4/3] rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/25 via-pink-500/15 to-cyan-400/10 p-3">
              <Search className="h-4 w-4 text-pink-200" />
              <p className="mt-8 text-sm font-bold text-white">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroVideo() {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || failed) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) video.play().catch(() => {});
  }, [failed]);

  const toggleAudio = () => {
    const next = !muted;
    setMuted(next);
    if (ref.current) {
      ref.current.muted = next;
      if (!next) ref.current.play().catch(() => {});
    }
  };

  return (
    <motion.div {...fadeUp} className="relative mx-auto mt-8 max-w-6xl overflow-hidden rounded-[2.2rem] border border-white/10 bg-[#0b0614] shadow-2xl shadow-purple-950/40">
      <div className="aspect-[16/9] min-h-[310px] sm:min-h-[420px]">
        {failed ? (
          <ProductFallback />
        ) : (
          <video
            ref={ref}
            className="h-full w-full object-cover"
            autoPlay
            muted={muted}
            loop
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            aria-label="SnapNext Digital Life OS product demonstration"
          >
            <source src={media.hero} type="video/mp4" />
          </video>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07020F]/65 via-transparent to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 sm:bottom-6 sm:left-6 sm:right-6">
        <div className="pointer-events-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-200">SnapNext in motion</p>
          <p className="mt-1 text-sm font-semibold text-white/80">Your memories organize themselves.</p>
        </div>
        {!failed && (
          <button
            type="button"
            onClick={toggleAudio}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-xl transition hover:bg-black/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
            aria-label={muted ? 'Unmute hero video' : 'Mute hero video'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {muted ? 'Unmute' : 'Mute'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ViewportVideo({ src, title, eyebrow, children }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || failed) return undefined;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [failed]);

  return (
    <motion.div {...fadeUp} className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0614] shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-pink-300">{eyebrow}</p>
          <p className="mt-1 text-sm font-bold text-white">{title}</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-white/35"><Play className="h-3.5 w-3.5" /> Live product demo</span>
      </div>
      <div className="aspect-[16/10] min-h-[280px]">
        {failed ? (
          children || <ProductFallback compact />
        ) : (
          <video
            ref={ref}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="none"
            onError={() => setFailed(true)}
            aria-label={title}
          >
            <source src={src} type="video/mp4" />
          </video>
        )}
      </div>
    </motion.div>
  );
}

const problemCards = [
  [ImageIcon, 'Photos buried', 'The moments you care about disappear inside endless camera rolls.'],
  [Cloud, 'Life scattered', 'Photos, files, chats and cloud drives all live in different places.'],
  [Clock3, 'Stories forgotten', 'You remember the moment, but not where the file went.'],
  [Heart, 'Sharing feels manual', 'Family memories should be easy to relive, not another admin task.'],
];

const lifeSteps = [
  ['1', 'Bring it together', 'Phone photos, videos and connected sources flow into one private memory home.'],
  ['2', 'Let AI understand it', 'SnapNext recognizes people, moments, context and patterns without making you organize folders.'],
  ['3', 'Use your life', 'Search it, relive it, share it, or turn the right memories into something ready to post.'],
];

export default function MarketingLandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07020F] text-white selection:bg-pink-500 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(168,85,247,0.24),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(236,72,153,0.14),transparent_28%),linear-gradient(to_bottom,#07020F,#0b0414_45%,#07020F)]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07020F]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-pink-300" aria-label="SnapNext home">
            <BrandLogo size={32} priority />
            <div className="leading-tight">
              <div className="font-black tracking-tight">SnapNext AI</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">Life OS</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/60 md:flex" aria-label="Landing navigation">
            <a href="#life-os" className="transition hover:text-white">Life OS</a>
            <a href="#ai" className="transition hover:text-white">AI</a>
            <a href="#memories" className="transition hover:text-white">Memories</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-white/65 transition hover:text-white">Log in</Link>
            <Link href="/signup" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5 hover:bg-pink-100">Start Free</Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 px-5 pb-12 pt-12 text-center sm:px-6 lg:pb-20 lg:pt-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-pink-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-pink-100">
            <Sparkles className="h-3.5 w-3.5" /> The AI-powered Digital Life Operating System
          </div>
          <h1 className="text-5xl font-black leading-[0.92] tracking-[-0.05em] text-white sm:text-7xl lg:text-8xl">
            Your Digital Life.
            <span className="mt-2 block bg-gradient-to-r from-pink-300 via-purple-300 to-cyan-200 bg-clip-text text-transparent">Organized Forever.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/65 sm:text-xl">
            One private AI home for your photos, videos, documents, stories and the people who matter most.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 font-black text-white shadow-2xl shadow-pink-950/30 transition hover:-translate-y-1 hover:shadow-pink-500/20 sm:w-auto">
              Start Free <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <a href="#life-os" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-7 py-4 font-bold text-white transition hover:-translate-y-1 hover:bg-white/10 sm:w-auto">
              See how it works <Play className="h-4 w-4 fill-pink-300 text-pink-300" />
            </a>
          </div>
        </div>
        <HeroVideo />
        <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm font-semibold text-white/50">
          <span className="flex items-center gap-2"><Search className="h-4 w-4 text-pink-300" /> Find anything</span>
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Private by design</span>
          <span className="flex items-center gap-2"><Users className="h-4 w-4 text-cyan-300" /> Built around people</span>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/10 bg-white/[0.02] px-5 py-14 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="The problem" title="Your life is everywhere. Your memories should not be." text="SnapNext is designed around the way people actually remember: people, places, moments and meaning — not folders." />
          <div className="mt-8 grid gap-3 md:grid-cols-4">
            {problemCards.map(([Icon, title, text]) => (
              <motion.div {...fadeUp} key={title} className="rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-5">
                <Icon className="h-5 w-5 text-pink-300" />
                <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="life-os" className="relative z-10 px-5 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.88fr_1.12fr]">
          <div>
            <SectionHeader eyebrow="SnapNext Life OS" title="AI should quietly organize life for you." text="No complicated setup. No folder system to maintain. SnapNext keeps turning a growing digital archive into something understandable and useful." center={false} />
            <div className="mt-7 space-y-3">
              {lifeSteps.map(([number, title, text]) => (
                <motion.div {...fadeUp} key={number} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-sm font-black">{number}</div>
                  <div>
                    <h3 className="font-bold text-white">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-white/50">{text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <ViewportVideo src={media.dashboard} title="Your life, already organized" eyebrow="Product intelligence" />
        </div>
      </section>

      <section id="ai" className="relative z-10 border-y border-white/10 bg-white/[0.02] px-5 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.12fr_0.88fr]">
          <ViewportVideo src={media.assistant} title="Ask SnapNext about your life" eyebrow="LifeGPT" />
          <div>
            <SectionHeader eyebrow="Memory intelligence" title="Search the way you remember." text="Ask for a person, trip, document or moment in natural language. SnapNext is designed to find evidence, not guess." center={false} />
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                [Search, '“Show my Goa beach photos”', 'Find a memory from meaning, not a filename.'],
                [Brain, 'People-aware', 'Build around the relationships you confirm.'],
                [Lock, 'Private context', 'Your personal archive is not an ad profile.'],
                [Sparkles, 'Useful AI', 'Captions, stories and organization when you need them.'],
              ].map(([Icon, title, text]) => (
                <motion.div {...fadeUp} key={title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <Icon className="h-5 w-5 text-pink-300" />
                  <h3 className="mt-4 font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="memories" className="relative z-10 px-5 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="From archive to life" title="Not just stored. Ready when life happens." text="SnapNext turns the same memory library into different useful experiences without making you upload everything again." />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {[
              [Heart, 'Memories', 'Relive meaningful people, dates and moments instead of scrolling an endless grid.'],
              [RefreshCw, 'Smart Sync', 'Bring in as much as your plan can hold, prioritize what matters and keep originals untouched.'],
              [Wand2, 'Ready to Post', 'Turn selected memories into captions, stories and social-ready ideas while keeping you in control.'],
            ].map(([Icon, title, text]) => (
              <motion.div {...fadeUp} key={title} className="group rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.02] p-6 transition hover:-translate-y-1 hover:border-pink-300/25">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-400/10 ring-1 ring-pink-300/15"><Icon className="h-6 w-6 text-pink-200" /></div>
                <h3 className="mt-6 text-2xl font-black text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/55">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/10 bg-white/[0.02] px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionHeader eyebrow="Favorite People" title="Organize around people, not storage buckets." text="The people closest to you become a natural way to navigate memories, build private sharing spaces and create better stories." center={false} />
              <div className="mt-6 flex flex-wrap gap-2">
                {['Mom', 'Dad', 'Partner', 'Kids', 'Best friends'].map((person) => (
                  <span key={person} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/65">{person}</span>
                ))}
              </div>
            </div>
            <motion.div {...fadeUp} className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-pink-500/15 via-purple-600/10 to-cyan-400/10 p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Private circles', 'Share the right memories with the right people.'],
                  ['Life timeline', 'See how people and moments connect over time.'],
                  ['Shared memories', 'Build a family archive without turning it into public social media.'],
                  ['AI assistance', 'Get help finding, remembering and creating from your own archive.'],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                    <Check className="h-4 w-4 text-emerald-300" />
                    <h3 className="mt-4 font-bold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="pricing" className="relative z-10 px-5 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="Pricing" title="Start small. Let SnapNext grow with your life." text="Storage scales with your plan. The product experience stays useful from day one." />
          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {pricing.map((plan) => (
              <motion.div {...fadeUp} key={plan.name} className={`relative flex flex-col rounded-[1.8rem] border p-5 shadow-xl shadow-black/20 ${plan.featured ? 'border-pink-400/50 bg-gradient-to-b from-pink-500/15 to-purple-950/20' : 'border-white/10 bg-white/[0.03]'}`}>
                {plan.featured && <div className="absolute right-4 top-4 rounded-full bg-pink-400 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-black">Most Popular</div>}
                <h3 className="text-xl font-black text-white">{plan.name}</h3>
                <p className="mt-2 min-h-16 text-sm leading-5 text-white/50">{plan.line}</p>
                <div className="mt-5 flex items-end gap-1.5">
                  <span className="text-4xl font-black tracking-tight text-white">{plan.price}</span>
                  {plan.price !== '$0' && <span className="pb-1.5 text-xs text-white/40">/mo</span>}
                </div>
                {plan.annual && <p className="mt-1 text-xs font-semibold text-emerald-300">{plan.annual}</p>}
                <p className="mt-3 text-sm font-bold text-pink-200">{plan.storage}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-xs leading-5 text-white/60"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" /> {feature}</li>
                  ))}
                </ul>
                <Link href="/signup" className={`mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition hover:-translate-y-0.5 ${plan.featured ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'}`}>
                  {plan.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-white/35">AI features use fair monthly allowances by plan rather than “unlimited AI,” helping keep SnapNext fast and sustainable for everyone.</p>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/10 bg-white/[0.02] px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="Trust" title="Your memories stay yours." text="SnapNext is built as a private digital-life product, not an attention feed." />
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              [Lock, 'Private memory home', 'Your personal archive stays private unless you choose to share.'],
              [ShieldCheck, 'You control access', 'People, circles and shared memories are permission-driven.'],
              [Smartphone, 'Originals respected', 'Sync and organization should never silently alter your source library.'],
            ].map(([Icon, title, text]) => (
              <motion.div {...fadeUp} key={title} className="rounded-[1.7rem] border border-white/10 bg-[#0c0616]/80 p-6">
                <Icon className="h-5 w-5 text-pink-300" />
                <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-5 py-16 sm:px-6 lg:py-20">
        <motion.div {...fadeUp} className="mx-auto max-w-5xl overflow-hidden rounded-[2.4rem] border border-white/10 bg-gradient-to-br from-pink-500/20 via-purple-600/15 to-cyan-500/10 p-7 text-center shadow-2xl shadow-purple-950/30 sm:p-10">
          <Sparkles className="mx-auto h-8 w-8 text-pink-200" />
          <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-5xl">Your digital life deserves more than storage.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/60">Give your memories one intelligent home — organized, searchable, private and ready for whatever comes next.</p>
          <Link href="/signup" className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 font-black text-black transition hover:-translate-y-1 hover:bg-pink-100">
            Start Free <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </section>

      <footer className="relative z-10 border-t border-white/10 px-5 py-8 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><BrandLogo size={32} /><span className="font-bold text-white">SnapNext AI</span></div>
          <div className="flex flex-wrap gap-5">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/support" className="hover:text-white">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
