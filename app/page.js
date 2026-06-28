'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Cloud,
  Database,
  Eye,
  Heart,
  Image as ImageIcon,
  Laptop,
  Lock,
  MessageCircle,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Users,
  Wand2,
} from 'lucide-react';
import { motion } from 'framer-motion';

const fadeUp = {
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
};

const demoVideos = {
  hero: { mp4: '/hero-demo.mp4', webm: '/hero-demo.webm', label: 'hero-demo.mp4' },
  search: { mp4: '/search-demo.mp4', webm: '/search-demo.webm', label: 'search-demo.mp4' },
  timeline: { mp4: '/timeline-demo.mp4', webm: '/timeline-demo.webm', label: 'timeline-demo.mp4' },
  family: { mp4: '/family-demo.mp4', webm: '/family-demo.webm', label: 'family-demo.mp4' },
  sharing: { mp4: '/sharing-demo.mp4', webm: '/sharing-demo.webm', label: 'sharing-demo.mp4' },
  assistant: { mp4: '/assistant-demo.mp4', webm: '/assistant-demo.webm', label: 'assistant-demo.mp4' },
  sync: { mp4: '/sync-demo.mp4', webm: '/sync-demo.webm', label: 'sync-demo.mp4' },
};

const supportedNow = [
  { name: 'Camera Roll', icon: Camera },
  { name: 'Android', icon: Smartphone },
  { name: 'iPhone', icon: Smartphone },
  { name: 'Mac', icon: Laptop },
  { name: 'Windows', icon: Laptop },
];

const roadmap = ['Google Photos', 'Google Drive', 'Dropbox', 'OneDrive', 'Gmail', 'Instagram'];

const pricing = [
  {
    name: 'Free',
    price: '$0',
    storage: '15 GB',
    line: 'Start organizing your life today.',
    features: ['AI search basics', 'Private memory vault', 'Smart albums'],
    cta: 'Start Free',
  },
  {
    name: 'Plus',
    price: '$2.99',
    storage: '100 GB',
    line: 'For everyday families and creators.',
    features: ['More original-quality storage', 'AI captions', 'Family sharing'],
    cta: 'Go Plus',
    featured: true,
  },
  {
    name: 'Pro',
    price: '$9.99',
    storage: '1 TB',
    line: 'Your full digital life, protected.',
    features: ['Large vaults', 'Advanced AI studio', 'Memory health tools'],
    cta: 'Get Pro',
  },
];

function VideoSlot({ video, title, eyebrow, children, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const videoEl = ref.current;
    if (!videoEl) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) videoEl.play().catch(() => {});
        else videoEl.pause();
      },
      { threshold: 0.35 },
    );

    observer.observe(videoEl);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      {...fadeUp}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c0616]/90 shadow-2xl shadow-purple-950/40 ${className}`}
    >
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover opacity-30"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        data-webm={video.webm}
        data-mp4={video.mp4}
        aria-label={`${title} placeholder video`}
      />
      <div className="absolute -left-24 top-10 h-56 w-56 rounded-full bg-pink-500/20 blur-3xl transition duration-700 group-hover:scale-125" />
      <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl transition duration-700 group-hover:scale-125" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:38px_38px] opacity-20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(236,72,153,0.22),transparent_35%),linear-gradient(to_bottom,rgba(7,2,15,0.22),rgba(7,2,15,0.95))]" />
      <div className="relative z-10 p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-pink-300">{eyebrow}</p>
            <h3 className="mt-1 text-base font-bold text-white sm:text-lg">{title}</h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/60 shadow-inner shadow-white/5">
            <Play className="h-3 w-3 fill-pink-300 text-pink-300" /> Replace with {video.label}
          </div>
        </div>
        {children}
      </div>
    </motion.div>
  );
}

function ProductChrome({ children, compact = false }) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.025] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl ring-1 ring-white/5 transition duration-500 group-hover:border-pink-300/25">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">SnapNext</span>
      </div>
      <div className={`rounded-[1.15rem] border border-white/10 bg-[#090512]/90 shadow-inner shadow-purple-950/30 ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>{children}</div>
    </div>
  );
}

function HeroPreview() {
  return (
    <VideoSlot video={demoVideos.hero} title="Digital Life OS Preview" eyebrow="Hero product demo" className="mx-auto mt-12 max-w-6xl">
      <ProductChrome>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Life OS is active</p>
                  <p className="text-xs text-white/50">Sorting, finding, and protecting your memories.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ['34,218', 'memories indexed'],
                  ['12 GB', 'duplicates found'],
                  ['8', 'family vaults'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-lg shadow-black/20 transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.07]">
                    <div className="text-2xl font-black text-white">{value}</div>
                    <div className="text-xs text-white/45">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['Goa', 'Passport', 'Mom'].map((term, index) => (
                <div key={term} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-lg shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-pink-300/25">
                  <Search className="mb-4 h-4 w-4 text-pink-300" />
                  <p className="text-xs text-white/45">Search</p>
                  <p className="font-bold text-white">{term}</p>
                  <div className="mt-3 h-16 rounded-xl bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-cyan-500/20" style={{ opacity: 0.8 + index * 0.05 }} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-purple-950/45 to-black/20 p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Today</p>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-200">Protected</span>
            </div>
            <div className="space-y-3">
              {[
                ['Family beach day', 'AI album created'],
                ['Passport scan', 'Document found'],
                ['Dad birthday reel', 'Ready to share'],
                ['Old laptop import', 'Sync complete'],
              ].map(([title, detail]) => (
                <div key={title} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-lg shadow-black/20 transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.07]">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-pink-500/35 to-cyan-500/20" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-white/45">{detail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/30" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </ProductChrome>
    </VideoSlot>
  );
}

function SectionHeader({ eyebrow, title, text, center = true }) {
  return (
    <motion.div {...fadeUp} className={`${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      <p className="text-xs font-black uppercase tracking-[0.28em] text-pink-300">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">{title}</h2>
      {text && <p className="mt-5 text-base leading-7 text-white/62 sm:text-lg">{text}</p>}
    </motion.div>
  );
}

function SearchStory() {
  const [query, setQuery] = useState('Goa');
  const results = {
    Goa: ['Beach sunset', 'Family dinner', 'Flight ticket'],
    Passport: ['Passport scan', 'Visa email', 'Travel folder'],
    Mom: ['Birthday lunch', 'Sunday walk', 'Old voice note'],
  };

  return (
    <section id="search" className="px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeader eyebrow="AI search" title="Find anything in seconds." text="Type what you remember. SnapNext finds the moment." center={false} />
          <motion.div {...fadeUp}>
            <VideoSlot video={demoVideos.search} title="Search Demo" eyebrow="search-demo.mp4">
              <ProductChrome compact>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-black/30 px-4 py-3 ring-1 ring-white/10">
                    <Search className="h-5 w-5 text-pink-300" />
                    <span className="font-semibold text-white">{query}</span>
                    <span className="ml-auto text-xs text-emerald-300">Instant</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.keys(results).map((item) => (
                      <button
                        key={item}
                        onClick={() => setQuery(item)}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-pink-300 ${query === item ? 'bg-pink-500 text-white' : 'bg-white/5 text-white/65 hover:bg-white/10 hover:text-white'}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {results[query].map((item, index) => (
                    <motion.div key={`${query}-${item}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="aspect-[4/3] rounded-xl bg-gradient-to-br from-purple-500/35 via-pink-500/25 to-cyan-500/25" />
                      <p className="mt-3 text-sm font-bold text-white">{item}</p>
                      <p className="text-xs text-white/45">Found from your life archive</p>
                    </motion.div>
                  ))}
                </div>
              </ProductChrome>
            </VideoSlot>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function OrganizationSection() {
  return (
    <section id="organize" className="border-y border-white/10 bg-white/[0.02] px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader eyebrow="Automatic organization" title="Your photos organize themselves." text="Trips, people, documents, screenshots, and family moments fall into place." />
        <motion.div {...fadeUp} className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: Wand2, title: 'Albums appear', text: 'Goa trip. Passport. Baby milestones.' },
            { icon: RefreshCw, title: 'Duplicates fade', text: 'Keep the best. Clear the clutter.' },
            { icon: ShieldCheck, title: 'Important files surface', text: 'Documents stay easy to find.' },
          ].map((item) => (
            <div key={item.title} className="group rounded-[1.7rem] border border-white/10 bg-[#0c0616] p-6 transition hover:-translate-y-1 hover:border-pink-400/30 hover:bg-white/[0.04]">
              <item.icon className="h-6 w-6 text-pink-300" />
              <h3 className="mt-8 text-xl font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/55">{item.text}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function TimelineSection() {
  return (
    <section id="timeline" className="px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <VideoSlot video={demoVideos.timeline} title="Life Timeline" eyebrow="timeline-demo.mp4">
              <ProductChrome compact>
                <div className="relative space-y-5 pl-6 before:absolute before:left-2 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-gradient-to-b before:from-pink-400 before:via-purple-400 before:to-cyan-300">
                  {[
                    ['2018', 'First big trip', '112 memories connected'],
                    ['2021', 'New home', 'Photos, bills, notes together'],
                    ['2024', 'Family reunion', 'Shared with favorites'],
                    ['Today', 'Life OS active', 'Everything searchable'],
                  ].map(([year, title, text]) => (
                    <div key={title} className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <span className="absolute -left-[1.85rem] top-5 h-3 w-3 rounded-full bg-pink-300 shadow-lg shadow-pink-400/60" />
                      <p className="text-xs font-black text-pink-200">{year}</p>
                      <h3 className="mt-1 font-bold text-white">{title}</h3>
                      <p className="text-sm text-white/50">{text}</p>
                    </div>
                  ))}
                </div>
              </ProductChrome>
            </VideoSlot>
          </motion.div>
          <SectionHeader eyebrow="Timeline" title="Your life becomes a story." text="A living timeline you can revisit forever." center={false} />
        </div>
      </div>
    </section>
  );
}

function FamilySharingSection() {
  return (
    <section id="family" className="border-y border-white/10 bg-gradient-to-b from-purple-950/20 to-transparent px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader eyebrow="Family and sharing" title="Keep loved ones connected." text="Share moments privately. Keep originals safe. No messy chat threads." />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <VideoSlot video={demoVideos.family} title="Family Vault" eyebrow="family-demo.mp4" className="h-full">
              <ProductChrome compact>
                <div className="grid place-items-center gap-5 py-8">
                  <div className="flex items-center gap-4 sm:gap-8">
                    {['Grandparents', 'Parents', 'Children'].map((person, index) => (
                      <div key={person} className="text-center">
                        <div className="grid h-16 w-16 place-items-center rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/30 to-pink-500/20 text-xl font-black text-white sm:h-20 sm:w-20">
                          {index + 1}
                        </div>
                        <p className="mt-2 text-xs font-bold text-white/70">{person}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-center text-sm text-emerald-100">Baby milestones shared privately</div>
                </div>
              </ProductChrome>
            </VideoSlot>
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
            <VideoSlot video={demoVideos.sharing} title="Private Sharing" eyebrow="sharing-demo.mp4" className="h-full">
              <ProductChrome compact>
                <div className="space-y-3">
                  {[
                    ['Mom', 'Can view family trips'],
                    ['Partner', 'Can add new memories'],
                    ['Grandparents', 'Can see child milestones'],
                  ].map(([name, access]) => (
                    <div key={name} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-pink-500/20 text-sm font-bold text-pink-100">{name[0]}</div>
                      <div className="flex-1">
                        <p className="font-bold text-white">{name}</p>
                        <p className="text-xs text-white/45">{access}</p>
                      </div>
                      <Lock className="h-4 w-4 text-emerald-300" />
                    </div>
                  ))}
                </div>
              </ProductChrome>
            </VideoSlot>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function AssistantSection() {
  const prompts = ['Show Goa with Mom', 'Find my passport', 'Make a birthday caption'];
  const [active, setActive] = useState(prompts[0]);

  return (
    <section id="assistant" className="px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeader eyebrow="AI assistant" title="Ask your memories anything." text="A private assistant for your life archive." center={false} />
          <motion.div {...fadeUp}>
            <VideoSlot video={demoVideos.assistant} title="Assistant Demo" eyebrow="assistant-demo.mp4">
              <ProductChrome compact>
                <div className="space-y-3">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setActive(prompt)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-pink-300 ${active === prompt ? 'border-pink-400/40 bg-pink-500/15 text-white' : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'}`}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-pink-200">
                    <MessageCircle className="h-4 w-4" /> SnapNext AI
                  </div>
                  <p className="text-sm leading-6 text-white/75">
                    {active === 'Find my passport'
                      ? 'Found passport scan, visa email, and travel folder.'
                      : active === 'Make a birthday caption'
                        ? 'Created a warm caption from your favorite family photos.'
                        : 'Found the Goa trip and moments with Mom instantly.'}
                  </p>
                </div>
              </ProductChrome>
            </VideoSlot>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function EverywhereSection() {
  return (
    <section id="everywhere" className="border-y border-white/10 bg-white/[0.02] px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <VideoSlot video={demoVideos.sync} title="Works Everywhere" eyebrow="sync-demo.mp4">
              <ProductChrome compact>
                <div className="space-y-3">
                  {supportedNow.map((item) => (
                    <div key={item.name} className="flex items-center gap-3 text-sm text-white/75">
                      <item.icon className="h-4 w-4 text-pink-300" />
                      <span>{item.name}</span>
                    </div>
                  ))}
                </div>
              </ProductChrome>
            </VideoSlot>
          </motion.div>
          <motion.div {...fadeUp} className="space-y-8">
            <SectionHeader eyebrow="Works everywhere" title="Everything in one place." text="Your devices today. More cloud connections on the roadmap." center={false} />
            <div className="space-y-5">
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-white/45">Supported today</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-white/70 sm:grid-cols-3">
                  {supportedNow.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 text-pink-300" /> {item.name}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-white/45">Active roadmap</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-white/55 sm:grid-cols-3">
                  {roadmap.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-purple-300" /> {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section id="trust" className="border-y border-white/10 bg-white/[0.02] px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader eyebrow="Trust" title="Private by design." text="Your memories stay yours. Protected, organized, and ready when you need them." />
        <motion.div {...fadeUp} className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: Lock, title: 'Private vault', text: 'Personal memories stay protected.' },
            { icon: ShieldCheck, title: 'You control access', text: 'Share only what you choose.' },
            { icon: Eye, title: 'Clear ownership', text: 'Your life archive belongs to you.' },
          ].map((item) => (
            <div key={item.title} className="rounded-[1.7rem] border border-white/10 bg-[#0c0616]/80 p-6 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-pink-300/25 hover:bg-white/[0.04]">
              <item.icon className="h-5 w-5 text-pink-300" />
              <h3 className="mt-8 text-lg font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/55">{item.text}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader eyebrow="Pricing" title="Start free. Grow when ready." text="Simple plans for the memories that matter most." />
        <motion.div {...fadeUp} className="mt-12 grid gap-5 lg:grid-cols-3">
          {pricing.map((plan) => (
            <div key={plan.name} className={`relative rounded-[2rem] border p-6 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1 ${plan.featured ? 'border-pink-400/50 bg-gradient-to-b from-pink-500/15 to-purple-950/20 shadow-pink-950/25' : 'border-white/10 bg-white/[0.03] hover:border-pink-300/20 hover:bg-white/[0.045]'}`}>
              {plan.featured && <div className="absolute right-5 top-5 rounded-full bg-pink-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">Popular</div>}
              <h3 className="text-2xl font-black text-white">{plan.name}</h3>
              <p className="mt-2 text-sm text-white/55">{plan.line}</p>
              <div className="mt-8 flex items-end gap-2">
                <span className="text-5xl font-black text-white">{plan.price}</span>
                {plan.price !== '$0' && <span className="pb-2 text-white/45">/mo</span>}
              </div>
              <p className="mt-2 text-sm font-semibold text-pink-200">{plan.storage} included</p>
              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-white/65">
                    <Check className="h-4 w-4 text-emerald-300" /> {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 font-bold outline-none transition duration-300 focus-visible:ring-2 focus-visible:ring-pink-300 ${plan.featured ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-950/30 hover:-translate-y-0.5 hover:shadow-pink-500/20' : 'border border-white/10 bg-white/5 text-white hover:-translate-y-0.5 hover:bg-white/10'}`}>
                {plan.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default function MarketingLandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07020F] text-white selection:bg-pink-500 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(168,85,247,0.25),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(236,72,153,0.16),transparent_28%),linear-gradient(to_bottom,#07020F,#0b0414_45%,#07020F)]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] opacity-30 [mask-image:radial-gradient(circle_at_50%_0%,black,transparent_70%)]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07020F]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-pink-300" aria-label="SnapNext home">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-950/30">
              <Brain className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-black tracking-tight">SnapNext AI</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">Life OS</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/60 md:flex" aria-label="Landing navigation">
            <a href="#search" className="transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Search</a>
            <a href="#timeline" className="transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Timeline</a>
            <a href="#family" className="transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Family</a>
            <a href="#pricing" className="transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Pricing</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-white/65 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Log in</Link>
            <Link href="/signup" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black shadow-lg shadow-white/10 transition hover:-translate-y-0.5 hover:bg-pink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Start Free</Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 px-5 pb-20 pt-14 text-center sm:px-6 lg:pb-28 lg:pt-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-pink-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-pink-100">
            <Sparkles className="h-3.5 w-3.5" /> The AI-powered Digital Life Operating System
          </div>
          <h1 className="text-5xl font-black leading-[0.92] tracking-[-0.05em] text-white sm:text-7xl lg:text-8xl">
            Your Digital Life.
            <span className="mt-2 block bg-gradient-to-r from-pink-300 via-purple-300 to-cyan-200 bg-clip-text text-transparent">Organized Forever.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/68 sm:text-xl">
            An AI home for your photos, videos, documents, stories, and family memories.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm font-semibold text-white/55">
            <span className="flex items-center gap-2"><Search className="h-4 w-4 text-pink-300" /> Find anything.</span>
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Never lose memories.</span>
            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-cyan-300" /> Share with family.</span>
          </div>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 px-7 py-4 font-black text-white shadow-2xl shadow-pink-950/30 transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-pink-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 sm:w-auto">
              Start Free <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <a href="#search" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-7 py-4 font-bold text-white transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 sm:w-auto">
              Watch the product <Play className="h-4 w-4 fill-pink-300 text-pink-300" />
            </a>
          </div>
        </div>
        <HeroPreview />
      </section>

      <section className="relative z-10 px-5 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="The problem" title="Your life is scattered everywhere." text="Photos on phones. Files in clouds. Family moments lost in chats." />
          <motion.div {...fadeUp} className="mt-12 grid gap-4 md:grid-cols-4">
            {[
              { icon: ImageIcon, title: 'Photos buried', text: 'Great moments disappear in endless grids.' },
              { icon: Database, title: 'Files scattered', text: 'Documents live across too many places.' },
              { icon: Clock3, title: 'Time forgotten', text: 'Years pass. Stories get harder to find.' },
              { icon: Heart, title: 'Family disconnected', text: 'Sharing still feels messy and manual.' },
            ].map((item) => (
              <div key={item.title} className="rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-5">
                <item.icon className="h-5 w-5 text-white/45" />
                <h3 className="mt-8 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/50">{item.text}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <SearchStory />
      <OrganizationSection />
      <TimelineSection />
      <FamilySharingSection />
      <AssistantSection />
      <EverywhereSection />
      <TrustSection />

      <PricingSection />

      <section className="relative z-10 px-5 py-20 sm:px-6 lg:py-28">
        <motion.div {...fadeUp} className="mx-auto max-w-5xl overflow-hidden rounded-[2.2rem] border border-white/10 bg-gradient-to-br from-pink-500/20 via-purple-600/15 to-cyan-500/10 p-8 text-center shadow-2xl shadow-purple-950/30 sm:p-12">
          <Star className="mx-auto h-8 w-8 text-pink-200" />
          <h2 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-6xl">Start your Life OS today.</h2>
          <p className="mx-auto mt-5 max-w-xl text-white/65">Never lose your memories. Never search through chaos again.</p>
          <Link href="/signup" className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 font-black text-black transition hover:-translate-y-1 hover:bg-pink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">
            Start Free <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </section>

      <footer className="relative z-10 border-t border-white/10 px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600"><Brain className="h-4 w-4 text-white" /></div>
            <span className="font-bold text-white">SnapNext AI</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/privacy" className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Privacy</Link>
            <Link href="/terms" className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Terms</Link>
            <Link href="/support" className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
