'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Sparkles, Brain, Lock, Shield, Heart, Share2, Camera, Database, 
  RefreshCw, Cloud, Search, MessageSquare, ChevronRight, Check, X, 
  Activity, Video, Users, Globe, ArrowRight, Clock, ShieldCheck, 
  Award, Play, CheckCircle2, ChevronDown, CheckSquare, Eye, RefreshCw as LoopIcon, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MarketingLandingPage() {
  // Navigation active state (mock)
  const [activeTab, setActiveTab] = useState('features');
  
  // Interactive Live Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'user', text: 'Hey SnapNext, show me some of my happiest memories with Mom from last year.' },
    { 
      role: 'ai', 
      text: 'Here is what I compiled for you from 2025. Your highest-happiness score memories with Mom:',
      media: [
        { title: 'Mother’s Day Lunch', date: 'May 11, 2025', image: '👩‍👦', desc: 'AI detected high-resonance laughter & smiles.' },
        { title: 'Weekend Walk in Goa', date: 'Nov 23, 2025', image: '🏖️', desc: 'Beautiful sunset moment at Ashwem Beach.' }
      ],
      caption: '“Sunsets, laughs, and pure warmth with Mom. ❤️ #FamilyFirst #UnforgettableMoments”'
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Live Chat Questions
  const chatPrompts = [
    { q: "Show memories with Mom.", r: "I've searched your 2025 vaults. Found 24 high-sentiment memories with your Mom. Here are the top highlights:", media: [{ title: 'Mom’s Birthday Cake', date: 'Oct 14, 2025', image: '🎂', desc: 'The moment she blew out the candles with grandchildren.' }, { title: 'Sunday Coffee Ritual', date: 'Feb 8, 2025', image: '☕', desc: 'Cozy morning conversation captured automatically.' }], caption: '“The best moments are the quietest ones. Celebrating Mom today and every day. 🍰✨ #FamilyLegacy”' },
    { q: "Find my Goa trip.", r: "Retrieved 'Goa Travel Log' (November 20-25, 2025). AI clustered 312 photos, eliminated duplicates, and compiled this travel journal:", media: [{ title: 'Sunset Silhouette', date: 'Nov 21, 2025', image: '🌅', desc: 'Spectacular sunset capture at Vagator Beach.' }, { title: 'Beach Dinner Laughs', date: 'Nov 24, 2025', image: '🍽️', desc: 'Warm candle-lit smiles with the whole family.' }], caption: '“Salty hair, warm hearts, and ocean breezes. Goa 2025 was one for the books. 🌊🌴 #GoaDiaries #Wanderlust”' },
    { q: "Create a Father's Day reel.", r: "Generated 'Father’s Day Tribute Reel' layout. Selected 12 video clips of Dad, balanced audio levels, and prepared this ready-to-post sequence:", media: [{ title: 'Dad teaching Golf', date: 'June 15, 2025', image: '🏌️', desc: 'Slow motion focus, emotional crescendo music.' }, { title: 'Dad & Baby First Nap', date: 'Aug 2, 2024', image: '👶', desc: 'AI auto-recovered memory from cloud archive.' }], caption: '“To the man who taught me how to fly. Happy Father’s Day to the absolute best! 🏆💙 #FathersDay #Generations”' },
    { q: "Show my happiest memories from 2025.", r: "Analyzing your Life Sentiment Score for 2025. Your peak moments clustered around major milestones:", media: [{ title: 'Baby’s First Steps', date: 'April 30, 2025', image: '👣', desc: 'Captured in high definition, shared instantly with Vault.' }, { title: 'New Home Celebration', date: 'July 18, 2025', image: '🏡', desc: 'Surrounded by close friends, high laughter metrics.' }], caption: '“Reflecting on 2025: Steps taken, houses built, and lives changed. Pure gratitude. 🙏✨ #YearInReview #Memories”' }
  ];

  const handlePromptClick = (prompt) => {
    setIsTyping(true);
    setChatInput(prompt.q);
    
    setTimeout(() => {
      setChatHistory([
        { role: 'user', text: prompt.q },
        { role: 'ai', text: prompt.r, media: prompt.media, caption: prompt.caption }
      ]);
      setIsTyping(false);
      setChatInput('');
    }, 1200);
  };

  // Before vs After Active Switcher
  const [beforeAfterToggle, setBeforeAfterToggle] = useState('after');

  // Real Life Use Cases Tabs
  const [activeCaseTab, setActiveCaseTab] = useState('fathers_day');
  const useCases = {
    fathers_day: {
      title: "Father's Day Legacy",
      highlight: "AI scans 5 disconnected drives, pulls 12 ancient family videos, cleans audio, compiles an emotional 60-second video card, and delivers it securely to Dad's inbox.",
      badge: "AI Reel + Remastered Audio",
      output: "“The man, the myth, the legend. Thank you for showing me how to be strong.”",
      stat: "Recovered from: Dropbox (2012), Google Drive (2018), and iPhone local cache."
    },
    wedding: {
      title: "The Ultimate Wedding Hub",
      highlight: "Instead of messy shared folders, SnapNext sets up a private group. Guests upload photos, AI uses facial recognition to sort them, and delivers private, high-res albums to each guest.",
      badge: "AI Guest Sorting & Distribution",
      output: "“Your private, personalized wedding gallery is ready. Click to download high-resolution photos of yourself.”",
      stat: "Distributed 1,400+ high-fidelity photos to 80 guests instantly with zero effort."
    },
    baby_first_year: {
      title: "Baby’s Growth Timeline",
      highlight: "A dedicated private journal that maps weight, milestones, and expressions. AI translates coos into text prompts, compiling a beautiful digital growth vault updated by parents and grandparents.",
      badge: "Milestone Recognition Engine",
      output: "“Leo took his first step at 11:42 AM today. Grandpa has been notified and the moment is pinned to the Family Tree.”",
      stat: "Automatic visual timeline created with age-relative filters (e.g., 'Leo at 3 months', 'Leo at 6 months')."
    },
    family_vacation: {
      title: "Travel Storyteller",
      highlight: "Upload 200 random beach photos. SnapNext automatically clusters them by location, maps the coordinates, designs a high-style travel magazine page, and drafts ready-to-post Instagram captions.",
      badge: "Autonomous Travel Journals",
      output: "“Trip to Amalfi Coast: Sunset over Positano, fresh seafood in Sorrento, and boat rides in Capri.”",
      stat: "Saves 4 hours of tedious editing and caption writing per trip."
    }
  };

  // Currency & Pricing Setup
  const [activeCurrency, setActiveCurrency] = useState('USD');
  const [billingPeriod, setBillingPeriod] = useState('monthly'); // 'monthly' or 'yearly'
  
  const currencies = [
    { code: 'USD', symbol: '$', rate: 1.0 },
    { code: 'EUR', symbol: '€', rate: 0.92 },
    { code: 'GBP', symbol: '£', rate: 0.78 },
    { code: 'INR', symbol: '₹', rate: 83.5 },
    { code: 'AUD', symbol: 'A$', rate: 1.50 },
    { code: 'CAD', symbol: 'C$', rate: 1.36 },
    { code: 'AED', symbol: 'AED ', rate: 3.67 },
    { code: 'SGD', symbol: 'S$', rate: 1.35 }
  ];

  const pricingPlans = [
    {
      name: 'Free Starter',
      storage: '15 GB',
      desc: 'Perfect for testing the waters of the AI Life OS.',
      basePriceUSD: 0,
      features: [
        'AI Intelligent Search',
        'Multi-Cloud Connection (1 source)',
        'Standard Quality Backup',
        'AI Smart Search Assistant',
        'Secure 2FA Encrypted Storage'
      ],
      cta: 'Start Free',
      popular: false
    },
    {
      name: 'SnapNext Plus',
      storage: '200 GB',
      desc: 'Generous storage for your essential daily memories.',
      basePriceUSD: 2.99,
      features: [
        'Everything in Free',
        'AI Memory Assistant Pro',
        'Full Multi-Cloud Sync (Unlimited sources)',
        'Original Quality Photo & Video Vault',
        'AI Journal Creator (10 entries/mo)',
        'Favorites Direct Auto-Sharing'
      ],
      cta: 'Go Plus',
      popular: false
    },
    {
      name: 'SnapNext Pro',
      storage: '2 TB',
      desc: 'Your entire digital footprint, secure and intelligent.',
      basePriceUSD: 9.99,
      features: [
        'Everything in Plus',
        'Unlimited AI Journal Generation',
        'Advanced Creator Studio Workflow',
        'Biometric-Locked Family Vault (Up to 3 members)',
        'Memory Health & Duplicate Cleanup Engine',
        '100-Year Legacy Guarantee Protection'
      ],
      cta: 'Get Pro',
      popular: true
    },
    {
      name: 'Family Heritage',
      storage: '10 TB',
      desc: 'The ultimate vault to secure your generations of legacy.',
      basePriceUSD: 29.99,
      features: [
        'Everything in Pro',
        'Secure Family Vault (Up to 8 members)',
        'Autonomous AI Family Historian Integration',
        'Multi-generational Timeline Merging',
        'Priority Encrypted Off-site Backup Mirroring',
        'VIP Concierge Media Setup Support'
      ],
      cta: 'Secure Family Vault',
      popular: false
    }
  ];

  const getPrice = (basePriceUSD) => {
    if (basePriceUSD === 0) return 'Free';
    const curr = currencies.find(c => c.code === activeCurrency) || currencies[0];
    let converted = basePriceUSD * curr.rate;
    
    // Apply yearly discount if applicable
    if (billingPeriod === 'yearly') {
      converted = converted * 0.8; // 20% discount
    }
    
    // Format price elegantly based on currency
    if (curr.code === 'INR') {
      const rounded = Math.round(converted);
      return `${curr.symbol}${rounded.toLocaleString('en-IN')}`;
    }
    return `${curr.symbol}${converted.toFixed(2)}`;
  };

  // Language experience state
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const languages = [
    { name: 'English', native: 'English' },
    { name: 'Hindi', native: 'हिन्दी' },
    { name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
    { name: 'Spanish', native: 'Español' },
    { name: 'French', native: 'Français' },
    { name: 'German', native: 'Deutsch' },
    { name: 'Arabic', native: 'العربية' },
    { name: 'Chinese', native: '中文' },
    { name: 'Japanese', native: '日本語' },
    { name: 'Korean', native: '한국어' },
    { name: 'Portuguese', native: 'Português' },
    { name: 'Italian', native: 'Italiano' },
    { name: 'Russian', native: 'Русский' },
    { name: 'Bengali', native: 'বাংলা' },
    { name: 'Urdu', native: 'اردو' },
    { name: 'Tamil', native: 'தமிழ்' },
    { name: 'Telugu', native: 'తెలుగు' },
    { name: 'Gujarati', native: 'ગુજરાતી' },
    { name: 'Marathi', native: 'मराठी' },
    { name: 'Malayalam', native: 'മലയാളം' },
    { name: 'Dutch', native: 'Nederlands' },
    { name: 'Turkish', native: 'Türkçe' },
    { name: 'Vietnamese', native: 'Tiếng Việt' },
    { name: 'Thai', native: 'ไทย' },
    { name: 'Indonesian', native: 'Bahasa Indonesia' }
  ];

  // Auto-detect currency mock (demonstrates optimization)
  useEffect(() => {
    // Basic timezone or locale check mock
    const locale = typeof window !== 'undefined' ? window.navigator.language : '';
    if (locale.includes('IN')) setActiveCurrency('INR');
    else if (locale.includes('GB')) setActiveCurrency('GBP');
    else if (locale.includes('DE') || locale.includes('FR') || locale.includes('ES') || locale.includes('IT')) setActiveCurrency('EUR');
    else if (locale.includes('AU')) setActiveCurrency('AUD');
    else if (locale.includes('CA')) setActiveCurrency('CAD');
    else if (locale.includes('SG')) setActiveCurrency('SGD');
    else if (locale.includes('AE')) setActiveCurrency('AED');
  }, []);

  return (
    <div className="bg-[#07020F] text-slate-100 min-h-screen selection:bg-purple-500 selection:text-white font-sans overflow-x-hidden">
      
      {/* 1. HEADER / NAVIGATION */}
      <header className="sticky top-0 z-50 bg-[#07020F]/80 backdrop-blur-md border-b border-purple-950/40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-cyan-400 p-[2px]">
              <div className="w-full h-full bg-[#07020F] rounded-[10px] flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-400 animate-pulse" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-purple-100 to-purple-400 bg-clip-text text-transparent">
                SnapNext <span className="text-cyan-400 text-sm font-semibold tracking-widest ml-1 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/30">AI</span>
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-purple-400 transition">Features</a>
            <a href="#life-graph" className="hover:text-purple-400 transition">Life Graph</a>
            <a href="#family-vault" className="hover:text-purple-400 transition">Family Vault</a>
            <a href="#pricing" className="hover:text-purple-400 transition">Pricing</a>
            <a href="#security" className="hover:text-purple-400 transition">Security & Trust</a>
          </nav>

          <div className="flex items-center space-x-4">
            <Link href="/login" className="text-sm font-medium hover:text-white transition px-4 py-2 text-slate-300">
              Log In
            </Link>
            <Link href="/signup" className="relative group overflow-hidden bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition duration-300 shadow-lg shadow-purple-950/50">
              <span className="relative z-10">Start Free</span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </Link>
            <Link href="/dashboard" className="hidden lg:flex items-center space-x-1 border border-purple-800/50 hover:bg-purple-950/30 text-purple-300 text-xs font-semibold px-4 py-2 rounded-xl transition">
              <span>Launch App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative pt-12 pb-24 md:py-32 overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-pink-900/10 rounded-full blur-[130px] pointer-events-none" />
        
        {/* Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#130c26_1px,transparent_1px),linear-gradient(to_bottom,#130c26_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          
          <div className="inline-flex items-center space-x-2 bg-purple-950/60 border border-purple-800/40 px-4 py-1.5 rounded-full mb-8 text-xs font-semibold tracking-wide text-purple-300 shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-spin" />
            <span>THE NEXT-GEN LIFE OPERATING SYSTEM</span>
          </div>

          <h1 className="text-5xl md:text-8xl font-black tracking-tight leading-[0.9] text-white select-none">
            YOUR LIFE. <br />
            <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400 bg-clip-text text-transparent">
              ORGANIZED FOREVER.
            </span>
          </h1>

          <p className="max-w-2xl mx-auto mt-8 text-lg md:text-xl text-slate-300 font-light leading-relaxed">
            The AI-Powered Digital Life Operating System. Every photo, video, memory, and story across your cloud and devices. 
            Finally connected, secure, and searchable.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-700 hover:from-purple-500 hover:via-pink-500 hover:to-purple-600 text-white font-bold rounded-2xl shadow-xl shadow-purple-900/40 hover:shadow-purple-500/30 transition transform hover:-translate-y-1 text-center">
              Start Free (15 GB)
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-slate-900/80 hover:bg-slate-900 border border-purple-950 hover:border-purple-800 text-white font-semibold rounded-2xl transition transform hover:-translate-y-1 text-center flex items-center justify-center space-x-2">
              <Play className="w-4 h-4 text-pink-400 fill-pink-400" />
              <span>Launch App</span>
            </Link>
          </div>

          <p className="mt-6 text-xs text-slate-500 tracking-wider">
            ⚡ CONNECTS: GOOGLE PHOTOS • DROPBOX • INSTAGRAM • GMAIL • PHONE ROLL
          </p>

          {/* Interactive Floating Memory Ecosystem Mockup */}
          <div className="mt-16 max-w-5xl mx-auto relative p-[1px] rounded-3xl bg-gradient-to-b from-purple-800/40 via-transparent to-pink-900/30">
            <div className="bg-[#0b0414]/90 rounded-[23px] overflow-hidden p-6 md:p-12 border border-purple-950/50 shadow-2xl relative">
              
              {/* Central Core */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl animate-pulse pointer-events-none" />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10 text-left">
                
                {/* Visual block 1: Cloud integration */}
                <div className="bg-purple-950/20 border border-purple-900/30 p-6 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Autonomous Sync</span>
                    <LoopIcon className="w-4 h-4 text-cyan-400 animate-spin" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Connected Feeds</h3>
                  <p className="text-sm text-slate-400 mb-4">Dropbox, Google Drive, WhatsApp & Local assets synced in real time.</p>
                  <div className="flex space-x-2">
                    <span className="bg-slate-900 px-2.5 py-1 rounded text-xs text-slate-300">Google Drive</span>
                    <span className="bg-slate-900 px-2.5 py-1 rounded text-xs text-slate-300">Dropbox</span>
                    <span className="bg-slate-900 px-2.5 py-1 rounded text-xs text-slate-300">Apple</span>
                  </div>
                </div>

                {/* Visual block 2: AI Core */}
                <div className="bg-gradient-to-b from-purple-900/40 to-pink-950/20 border border-purple-500/30 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute -top-12 -right-12 w-24 h-24 bg-pink-500/30 rounded-full blur-xl group-hover:scale-125 transition" />
                  <div>
                    <div className="flex items-center space-x-2 mb-3">
                      <Brain className="w-5 h-5 text-pink-400" />
                      <span className="text-xs font-bold text-pink-400 uppercase tracking-widest">Active Neural Engine</span>
                    </div>
                    <h3 className="text-xl font-black text-white leading-tight">AI Memory Core</h3>
                    <p className="text-sm text-purple-200 mt-2">Constantly sorting duplicates, transcribing audio, recognizing faces, and writing stories.</p>
                  </div>
                  <div className="mt-6 border-t border-purple-800/40 pt-4 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Memory Health Status</span>
                    <span className="text-xs font-extrabold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded">98% OPTIMAL</span>
                  </div>
                </div>

                {/* Visual block 3: Output */}
                <div className="bg-purple-950/20 border border-purple-900/30 p-6 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Deliverable Generation</span>
                    <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Automated Outputs</h3>
                  <p className="text-sm text-slate-400 mb-4">Beautiful magazines, slideshows, historical legacy journals created dynamically.</p>
                  <div className="bg-slate-950 p-3 rounded-lg border border-purple-950">
                    <p className="text-xs font-mono text-purple-300 italic">“Our Trip to Venice — June 2025. Generational milestone record archived.”</p>
                  </div>
                </div>

              </div>

              {/* Grid visual footer */}
              <div className="mt-8 pt-6 border-t border-purple-950/60 flex flex-wrap items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>Zero-Knowledge Encryption Standard Safeguard</span>
                </div>
                <div>
                  <span>No training on personal metadata • Full Ownership</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* 3. LIFE GRAPH SECTION (Signature Differentiator) */}
      <section id="life-graph" className="py-24 border-t border-purple-950/60 relative">
        <div className="absolute top-1/2 left-0 w-80 h-80 bg-cyan-900/10 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest">Signature Feature</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-2">The Autonomous Life Graph</h2>
            <p className="text-slate-300 mt-4 text-lg">
              Not a list of files. An dynamic, interconnected visual graph of your lifetime milestones, friendships, and travel paths built autonomously from metadata.
            </p>
          </div>

          {/* Interactive Timeline Graph Display */}
          <div className="bg-purple-950/10 border border-purple-900/30 rounded-3xl p-6 md:p-12 relative overflow-hidden">
            
            {/* Timeline center line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-gradient-to-b from-purple-500 via-pink-500 to-cyan-500 -translate-x-1/2 hidden md:block" />

            <div className="space-y-12 relative">
              
              {/* Event 1 - Left */}
              <div className="flex flex-col md:flex-row items-center justify-between md:space-x-12">
                <div className="w-full md:w-1/2 text-center md:text-right md:pr-12">
                  <span className="text-pink-400 font-extrabold text-lg">2018</span>
                  <h3 className="text-2xl font-bold text-white mt-1">First Major Trip Together</h3>
                  <p className="text-slate-400 mt-2 text-sm max-w-md md:ml-auto">
                    AI linked scattered Facebook posts, Dropbox photos, and plane tickets into your first comprehensive adventure diary to Kyoto, Japan.
                  </p>
                </div>
                {/* Timeline Node */}
                <div className="w-10 h-10 rounded-full bg-pink-500 border-4 border-[#07020F] flex items-center justify-center z-10 my-4 md:my-0 shadow-lg shadow-pink-500/50">
                  <span className="text-xs">🌸</span>
                </div>
                <div className="w-full md:w-1/2 pl-12 hidden md:block">
                  <div className="bg-pink-950/20 border border-pink-900/30 p-4 rounded-xl max-w-sm inline-block">
                    <p className="text-xs text-pink-300">✦ Clustered 112 photos • Automatically recovered high quality copies</p>
                  </div>
                </div>
              </div>

              {/* Event 2 - Right */}
              <div className="flex flex-col md:flex-row items-center justify-between md:space-x-12">
                <div className="w-full md:w-1/2 pr-12 hidden md:block text-right">
                  <div className="bg-purple-950/20 border border-purple-900/30 p-4 rounded-xl max-w-sm inline-block text-left">
                    <p className="text-xs text-purple-300">✦ Clustered 824 guests memories • Facial indexing completed</p>
                  </div>
                </div>
                {/* Timeline Node */}
                <div className="w-10 h-10 rounded-full bg-purple-500 border-4 border-[#07020F] flex items-center justify-center z-10 my-4 md:my-0 shadow-lg shadow-purple-500/50">
                  <span className="text-xs">💍</span>
                </div>
                <div className="w-full md:w-1/2 text-center md:text-left md:pl-12">
                  <span className="text-purple-400 font-extrabold text-lg">2020</span>
                  <h3 className="text-2xl font-bold text-white mt-1">Wedding Legacy Registry</h3>
                  <p className="text-slate-400 mt-2 text-sm max-w-md">
                    Guests uploaded unfiltered snapshots. SnapNext sorted them dynamically based on faces and generated the first unified family heirloom.
                  </p>
                </div>
              </div>

              {/* Event 3 - Left */}
              <div className="flex flex-col md:flex-row items-center justify-between md:space-x-12">
                <div className="w-full md:w-1/2 text-center md:text-right md:pr-12">
                  <span className="text-cyan-400 font-extrabold text-lg">2022</span>
                  <h3 className="text-2xl font-bold text-white mt-1">Baby Born & Growth Lock</h3>
                  <p className="text-slate-400 mt-2 text-sm max-w-md md:ml-auto">
                    Leo's birth. Automated secure notifications are sent to Grandparents with dynamic voice summaries. Memory locked forever.
                  </p>
                </div>
                {/* Timeline Node */}
                <div className="w-10 h-10 rounded-full bg-cyan-500 border-4 border-[#07020F] flex items-center justify-center z-10 my-4 md:my-0 shadow-lg shadow-cyan-500/50">
                  <span className="text-xs">👶</span>
                </div>
                <div className="w-full md:w-1/2 pl-12 hidden md:block">
                  <div className="bg-cyan-950/20 border border-cyan-900/30 p-4 rounded-xl max-w-sm inline-block">
                    <p className="text-xs text-cyan-300">✦ Linked to Grandparents Favorites Shared feed automatically</p>
                  </div>
                </div>
              </div>

              {/* Event 4 - Right */}
              <div className="flex flex-col md:flex-row items-center justify-between md:space-x-12">
                <div className="w-full md:w-1/2 pr-12 hidden md:block text-right">
                  <div className="bg-yellow-950/20 border border-yellow-900/30 p-4 rounded-xl max-w-sm inline-block text-left">
                    <p className="text-xs text-yellow-300">✦ GPS tagged 4 countries • Compiled 3 Travel Magazines</p>
                  </div>
                </div>
                {/* Timeline Node */}
                <div className="w-10 h-10 rounded-full bg-yellow-500 border-4 border-[#07020F] flex items-center justify-center z-10 my-4 md:my-0 shadow-lg shadow-yellow-500/50">
                  <span className="text-xs">✈️</span>
                </div>
                <div className="w-full md:w-1/2 text-center md:text-left md:pl-12">
                  <span className="text-yellow-400 font-extrabold text-lg">2024</span>
                  <h3 className="text-2xl font-bold text-white mt-1">Global Family Reunion</h3>
                  <p className="text-slate-400 mt-2 text-sm max-w-md">
                    Cross-generational photo sync. Merged vacation timeline across Positano, Amalfi and London into a shared chronological vault.
                  </p>
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* 4. BEFORE VS AFTER SNAPNEXT */}
      <section className="py-24 bg-purple-950/10 border-t border-purple-950/60 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-pink-400 uppercase tracking-widest">The Transformation</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-2">Unified Life OS vs Disjointed Chaos</h2>
            <p className="text-slate-300 mt-4">
              See what changes the moment you bridge your existing silos with SnapNext AI.
            </p>

            {/* Toggle Switch */}
            <div className="inline-flex bg-slate-900 p-1.5 rounded-xl border border-purple-950 mt-8">
              <button 
                onClick={() => setBeforeAfterToggle('before')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition duration-200 ${beforeAfterToggle === 'before' ? 'bg-red-950 text-red-200 border border-red-800/40' : 'text-slate-400 hover:text-white'}`}
              >
                Before SnapNext
              </button>
              <button 
                onClick={() => setBeforeAfterToggle('after')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition duration-200 ${beforeAfterToggle === 'after' ? 'bg-purple-900 text-purple-200 border border-purple-700/40' : 'text-slate-400 hover:text-white'}`}
              >
                After SnapNext (The Life OS)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            
            {/* Visual dynamic change cards based on toggle state */}
            <div className={`p-8 rounded-3xl border transition duration-500 ${beforeAfterToggle === 'before' ? 'bg-red-950/10 border-red-950' : 'bg-slate-900/40 border-slate-800 opacity-60'}`}>
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-red-950 flex items-center justify-center">
                  <X className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Scattered Fragmented Chaos</h3>
                  <p className="text-xs text-red-300">Google Drive • Dropbox • iCloud • WhatsApp • Instagram</p>
                </div>
              </div>

              <ul className="space-y-4 text-sm text-slate-300">
                <li className="flex items-start space-x-3">
                  <span className="text-red-500 mt-0.5">⚠️</span>
                  <span><strong>Disorganized drives:</strong> Thousand of unsorted folders and unnamed IMG_2894.png files you will never search.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-red-500 mt-0.5">⚠️</span>
                  <span><strong>Scattered Memories:</strong> Half of your vacation photos reside on an old laptop, others on Google Photos, others are lost in WhatsApp chat logs.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-red-500 mt-0.5">⚠️</span>
                  <span><strong>Storage exhaustion:</strong> Paying for 3 duplicate cloud subscriptions because there is no cleanup engine.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-red-500 mt-0.5">⚠️</span>
                  <span><strong>Silent forgetting:</strong> Memories of your children’s childhood are buried, forgotten, and unsearchable.</span>
                </li>
              </ul>
            </div>

            <div className={`p-8 rounded-3xl border transition duration-500 ${beforeAfterToggle === 'after' ? 'bg-purple-950/20 border-purple-500/30' : 'bg-slate-900/40 border-slate-800 opacity-60'}`}>
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-900 flex items-center justify-center">
                  <Check className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Unified SnapNext Life OS</h3>
                  <p className="text-xs text-purple-300">Intelligent • Central • Safe • Searchable</p>
                </div>
              </div>

              <ul className="space-y-4 text-sm text-slate-300">
                <li className="flex items-start space-x-3">
                  <span className="text-purple-400 mt-0.5">✨</span>
                  <span><strong>Continuous automatic cleanup:</strong> Auto-groups 124+ duplicate files, compresses fluff, recovers gigabytes.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-purple-400 mt-0.5">✨</span>
                  <span><strong>Fully relational search:</strong> Type "Goa sunsets with Dad in blue shirt" and pull the exact high-res file in 0.5s.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-purple-400 mt-0.5">✨</span>
                  <span><strong>AI Journal Creation:</strong> Upload images and watch the system build historical magazines detailing trip logs.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-purple-400 mt-0.5">✨</span>
                  <span><strong>Secure generational bridge:</strong> Connect the vault with grandchildren, protecting critical records forever.</span>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* 5. INTERACTIVE AI MEMORY ASSISTANT */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute right-0 top-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Left side info */}
            <div>
              <span className="text-xs font-extrabold text-purple-400 uppercase tracking-widest">Conversational Memory Search</span>
              <h2 className="text-3xl md:text-5xl font-black text-white mt-2 leading-tight">
                Ask AI anything about your life history.
              </h2>
              <p className="text-slate-300 mt-6 text-lg">
                Your memories hold stories, names, locations, and contexts. Speak naturally to retrieve precise timelines, compile highlight reels, or draft journals.
              </p>

              {/* Chat Prompts */}
              <div className="mt-8 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Try clicking a sample prompt below:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {chatPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePromptClick(p)}
                      className="text-left text-xs bg-purple-950/20 hover:bg-purple-900/40 border border-purple-900/30 p-3 rounded-xl transition font-medium text-slate-300 hover:text-white flex items-center justify-between group"
                    >
                      <span>"{p.q}"</span>
                      <ChevronRight className="w-3.5 h-3.5 text-pink-500 opacity-0 group-hover:opacity-100 transition" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right side live simulated terminal chat box */}
            <div className="bg-slate-950/90 border border-purple-950 rounded-3xl p-6 shadow-2xl relative">
              <div className="absolute top-4 right-4 flex space-x-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/30" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/30" />
                <div className="w-3 h-3 rounded-full bg-green-500/30" />
              </div>
              
              <div className="flex items-center space-x-2 border-b border-purple-950 pb-4 mb-4">
                <Brain className="w-5 h-5 text-purple-400 animate-pulse" />
                <span className="text-xs font-mono font-bold tracking-widest text-slate-400">SNAPNEXT_MEMORY_ENGINE_V3</span>
              </div>

              {/* Chat area */}
              <div className="space-y-4 min-h-[300px] flex flex-col justify-end">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`space-y-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block p-3.5 rounded-2xl text-sm max-w-[85%] ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-br-none' : 'bg-slate-900 border border-purple-950/80 text-slate-200 rounded-bl-none'}`}>
                      {msg.text}
                    </div>

                    {msg.media && (
                      <div className="grid grid-cols-2 gap-3 mt-2 max-w-sm">
                        {msg.media.map((med, i) => (
                          <div key={i} className="bg-slate-900 border border-purple-950 rounded-xl p-3 text-left">
                            <div className="text-2xl mb-1">{med.image}</div>
                            <h4 className="text-xs font-bold text-white">{med.title}</h4>
                            <p className="text-[10px] text-slate-500">{med.date}</p>
                            <p className="text-[10px] text-slate-400 mt-1 italic">{med.desc}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.caption && (
                      <div className="bg-purple-950/15 border border-purple-900/30 p-3 rounded-xl max-w-sm mt-2 text-left">
                        <span className="text-[10px] uppercase tracking-wider text-pink-400 font-bold block mb-1">AI Drafted Instagram Caption</span>
                        <p className="text-xs text-slate-300 font-mono italic">{msg.caption}</p>
                      </div>
                    )}
                  </div>
                ))}

                {isTyping && (
                  <div className="text-left space-y-1">
                    <div className="inline-block p-3 bg-slate-900 border border-purple-950 rounded-2xl text-xs text-slate-400 rounded-bl-none">
                      <span className="animate-pulse">AI is parsing archives & transcribing timestamps...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input container */}
              <div className="mt-6 pt-4 border-t border-purple-950/80 flex items-center space-x-3">
                <input
                  type="text"
                  readOnly
                  placeholder={chatInput || "Click a sample prompt above to test AI..."}
                  className="bg-slate-900 border border-purple-950/50 rounded-xl px-4 py-3 text-sm text-slate-300 w-full focus:outline-none focus:border-purple-800"
                />
                <button className="bg-purple-600 p-3 rounded-xl text-white hover:bg-purple-500 transition">
                  <Search className="w-4 h-4" />
                </button>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* 6. FAMILY VAULT */}
      <section id="family-vault" className="py-24 border-t border-purple-950/60 relative bg-purple-950/5">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-900/5 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-purple-400 uppercase tracking-widest">Generational Archiving</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-2">A Private Home For Family Heritage</h2>
            <p className="text-slate-300 mt-4 text-lg">
              Pass on pure stories, not messy chat groups. Group together photos, letters, voice diaries, and build an interactive family vault connected forever.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Visual Node Graph represent grandparents down to grandchildren */}
            <div className="bg-slate-950/60 border border-purple-950 rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl" />
              
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8 text-center">Connected Family Tree Vault</h3>

              <div className="space-y-12 relative z-10">
                
                {/* Generation 1 */}
                <div className="flex justify-center">
                  <div className="bg-purple-950/50 border border-purple-500/30 px-5 py-3 rounded-2xl text-center shadow-lg">
                    <span className="text-2xl block">👵👴</span>
                    <span className="text-xs font-extrabold text-white block mt-1">Grandparents</span>
                    <span className="text-[10px] text-purple-300">Legacy Archives • 1968-Present</span>
                  </div>
                </div>

                {/* Connecting arrow/line */}
                <div className="h-4 w-0.5 bg-gradient-to-b from-purple-500 to-pink-500 mx-auto" />

                {/* Generation 2 */}
                <div className="flex justify-center">
                  <div className="bg-pink-950/50 border border-pink-500/30 px-5 py-3 rounded-2xl text-center shadow-lg">
                    <span className="text-2xl block">👨‍👩‍👧‍👦</span>
                    <span className="text-xs font-extrabold text-white block mt-1">Parents (You)</span>
                    <span className="text-[10px] text-pink-300">Life Milestones • 1995-Present</span>
                  </div>
                </div>

                {/* Connecting arrow/line */}
                <div className="h-4 w-0.5 bg-gradient-to-b from-pink-500 to-cyan-500 mx-auto" />

                {/* Generation 3 */}
                <div className="flex justify-center">
                  <div className="bg-cyan-950/50 border border-cyan-500/30 px-5 py-3 rounded-2xl text-center shadow-lg">
                    <span className="text-2xl block">👧👶</span>
                    <span className="text-xs font-extrabold text-white block mt-1">Children</span>
                    <span className="text-[10px] text-cyan-300">Milestones Automatically Archived</span>
                  </div>
                </div>

              </div>

              <p className="text-center text-xs text-slate-400 mt-8 font-mono italic">
                ✦ Secure biometrics locks separate parent vault access from children timeline views.
              </p>
            </div>

            {/* Description list */}
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Automated Grandchild Milestones</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  As soon as you upload baby photos, SnapNext identifies facial indexes and updates the grandparents’ customized feed. No duplicate file sending, no compressed WhatsApp pictures.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2">Heritage Legacy Chest</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Upload audio clips of grandma telling family recipes. SnapNext transcribes them, enhances the vocal clarity, links them with pictures, and stores them in an eternal digital heirloom.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2">Strict Granular Permission Control</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  You decide exactly who sees what. Keeps your private journal entries secret while allowing grandparents access to childhood travel galleries.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 7. FAVORITES RELATIONSHIPS */}
      <section className="py-24 border-t border-purple-950/60 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div>
              <span className="text-xs font-extrabold text-pink-400 uppercase tracking-widest">No duplication • Instant access</span>
              <h2 className="text-3xl md:text-5xl font-black text-white mt-2 leading-tight">
                Favorite Bridges: <br />
                Mother ↔ Daughter Sync
              </h2>
              <p className="text-slate-300 mt-6 text-lg leading-relaxed">
                Connect your account with the closest people in your life. SnapNext creates a mutual bridge: high-sentiment memories with children are automatically backed up to both accounts without duplicate storage charges.
              </p>
              
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="bg-purple-950/20 border border-purple-900/30 p-4 rounded-xl">
                  <h4 className="text-white font-bold text-sm mb-1">Instant Share</h4>
                  <p className="text-xs text-slate-400">Synced directly as photos are clicked.</p>
                </div>
                <div className="bg-purple-950/20 border border-purple-900/30 p-4 rounded-xl">
                  <h4 className="text-white font-bold text-sm mb-1">Original Quality</h4>
                  <p className="text-xs text-slate-400">No compression. Ever.</p>
                </div>
              </div>
            </div>

            {/* Visual simulation of relationship sync */}
            <div className="bg-slate-950 border border-purple-950 rounded-3xl p-8 relative flex flex-col items-center justify-center min-h-[340px]">
              <div className="absolute inset-0 bg-radial-gradient from-purple-500/10 to-transparent pointer-events-none" />
              
              <div className="flex items-center space-x-12 relative z-10">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-purple-600/20 border-2 border-purple-500 flex items-center justify-center text-3xl">
                    👩
                  </div>
                  <span className="text-xs font-bold text-white block mt-2">Mother</span>
                  <span className="text-[10px] text-slate-400">24 GB Shared</span>
                </div>

                <div className="flex flex-col items-center space-y-2">
                  <span className="text-[10px] font-mono text-pink-400 uppercase tracking-widest animate-pulse">AUTOPILOT SYNCING</span>
                  <div className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                    <span className="text-xs text-[#10B981] font-bold">ACTIVE</span>
                  </div>
                  <div className="w-24 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-full" />
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-cyan-600/20 border-2 border-cyan-500 flex items-center justify-center text-3xl">
                    👧
                  </div>
                  <span className="text-xs font-bold text-white block mt-2">Daughter</span>
                  <span className="text-[10px] text-slate-400">24 GB Shared</span>
                </div>
              </div>

              <div className="mt-8 bg-slate-900 border border-purple-950 p-4 rounded-xl text-center max-w-xs relative z-10">
                <p className="text-xs text-slate-300">“Goa beach memories synced automatically with Mum’s account.”</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 8. AI JOURNAL SHOWCASE */}
      <section className="py-24 bg-gradient-to-b from-purple-950/10 to-transparent border-t border-purple-950/60">
        <div className="max-w-7xl mx-auto px-6 text-center">
          
          <span className="text-xs font-extrabold text-purple-400 uppercase tracking-widest">Magazine-Quality Storytelling</span>
          <h2 className="text-3xl md:text-5xl font-black text-white mt-2 mb-6">AI Smart Journals</h2>
          <p className="text-slate-300 max-w-2xl mx-auto mb-16 text-lg">
            SnapNext detects related travel collections, uses deep-sentimental learning to outline storylines, draft headers, clean descriptions, and formats everything into luxurious digital magazines.
          </p>

          <div className="bg-slate-900/60 border border-purple-950 rounded-3xl p-6 md:p-12 text-left max-w-4xl mx-auto relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/5 rounded-full blur-[100px] pointer-events-none" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-[10px] font-mono text-pink-400 tracking-widest block uppercase mb-1">AUTOMATED ISSUE NO. 14</span>
                <h3 className="text-4xl font-extrabold text-white leading-tight">Our Family Trip To Goa</h3>
                <p className="text-sm text-slate-300 mt-4 leading-relaxed font-serif italic">
                  “A week filled with sunsets, gold-dusted beaches, and unforgettable family moments. Sitting under Positano umbrellas, Dad talked legacy while Leo built his first castle.”
                </p>
                <div className="mt-8 flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm">🏖️</div>
                  <div>
                    <span className="text-xs text-slate-400 block font-bold">November 2025</span>
                    <span className="text-[10px] text-slate-500">Clustered automatically from 4 devices</span>
                  </div>
                </div>
              </div>

              {/* Graphic magazine mockup card */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-purple-950 shadow-xl relative transform rotate-1 hover:rotate-0 transition duration-300">
                <div className="aspect-[4/3] bg-gradient-to-tr from-purple-900 via-pink-900 to-cyan-950 rounded-lg flex items-center justify-center text-6xl shadow-inner relative">
                  <span className="absolute top-4 right-4 text-xs font-bold text-slate-300 bg-slate-950/70 px-2 py-1 rounded">Goa Trip 2025</span>
                  📸🌅🌴
                </div>
                <div className="mt-4 flex justify-between text-xs text-slate-400">
                  <span>Story compiled by SnapNext AI</span>
                  <span className="text-[#10B981] font-bold">SENTIMENT: EXCELLENT</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 9. CREATOR WORKFLOW SECTION */}
      <section className="py-24 border-t border-purple-950/60 bg-purple-950/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest">Built for Creators</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-2">Zero-Effort Social Publishing</h2>
            <p className="text-slate-300 mt-4">
              Turn raw travel clips into publishable reels and media drafts in 5 seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            
            {/* Step 1 */}
            <div className="bg-slate-950 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-xs font-bold text-pink-500 font-mono block mb-2">STEP 01</span>
              <h3 className="text-white font-bold mb-1">Upload Media</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Drop raw photos and videos from your beach weekend vacation directly into SnapNext.</p>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-950 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-xs font-bold text-pink-500 font-mono block mb-2">STEP 02</span>
              <h3 className="text-white font-bold mb-1">AI Curation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">System filters duplicates, blurry images, and identifies core highlight clips immediately.</p>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-950 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-xs font-bold text-pink-500 font-mono block mb-2">STEP 03</span>
              <h3 className="text-white font-bold mb-1">Smart Captioning</h3>
              <p className="text-xs text-slate-400 leading-relaxed">SnapNext reads pixel data to generate emotional, witty, or descriptive Instagram captions.</p>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-950 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-xs font-bold text-pink-500 font-mono block mb-2">STEP 04</span>
              <h3 className="text-white font-bold mb-1">Hashtag Curation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Auto-analyzes visual elements and attaches optimized tag lists to guarantee resonance.</p>
            </div>

            {/* Step 5 */}
            <div className="bg-slate-950 border border-purple-950 p-6 rounded-2xl relative bg-gradient-to-b from-purple-950/20 to-pink-950/10">
              <span className="text-xs font-bold text-[#10B981] font-mono block mb-2">READY</span>
              <h3 className="text-white font-bold mb-1">1-Click Publish</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Send the final video directly to Instagram Drafts, TikTok, or your private family tree.</p>
            </div>

          </div>
        </div>
      </section>

      {/* 10. MEMORY HEALTH SECTION */}
      <section className="py-24 border-t border-purple-950/60 relative">
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-pink-900/10 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Visual Analytics */}
            <div className="bg-slate-950 border border-purple-950 rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/10 rounded-full blur-xl animate-pulse" />
              
              <div className="flex items-center justify-between mb-8">
                <span className="text-xs font-extrabold text-pink-400 tracking-wider font-mono">MEMORY_HEALTH_CONSOLE</span>
                <Activity className="w-5 h-5 text-pink-500" />
              </div>

              <div className="flex items-end justify-between mb-8">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase tracking-widest font-bold">Sentiment Health Index</span>
                  <span className="text-6xl font-black text-white leading-none">98%</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded font-bold">OPTIMIZED</span>
                </div>
              </div>

              {/* Duplicate metrics layout */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-purple-950/40 p-4 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase block tracking-wider font-bold">Duplicate Fluff</span>
                  <span className="text-xl font-bold text-white block mt-1">124 photos</span>
                  <p className="text-[10px] text-purple-400 mt-1">Can be compressed safely</p>
                </div>

                <div className="bg-slate-900 border border-purple-950/40 p-4 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase block tracking-wider font-bold">Recoverable Space</span>
                  <span className="text-xl font-bold text-[#10B981] block mt-1">12 GB</span>
                  <p className="text-[10px] text-[#10B981]/70 mt-1">Free space ready</p>
                </div>

                <div className="bg-slate-900 border border-purple-950/40 p-4 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase block tracking-wider font-bold">Forgotten Gems</span>
                  <span className="text-xl font-bold text-white block mt-1">2,300 files</span>
                  <p className="text-[10px] text-pink-400 mt-1">Discovered by AI model</p>
                </div>

                <div className="bg-slate-900 border border-purple-950/40 p-4 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase block tracking-wider font-bold">Worth Sharing</span>
                  <span className="text-xl font-bold text-cyan-400 block mt-1">7 moments</span>
                  <p className="text-[10px] text-cyan-400 mt-1">High-resonance emotional scores</p>
                </div>
              </div>

            </div>

            {/* Content text info */}
            <div>
              <span className="text-xs font-extrabold text-pink-400 uppercase tracking-widest">Storage Optimizer & Discovery</span>
              <h2 className="text-3xl md:text-5xl font-black text-white mt-2 leading-tight">
                No duplicate clutter. <br /> Just pure memories.
              </h2>
              <p className="text-slate-300 mt-6 text-lg leading-relaxed">
                Most cloud backup solutions charge you for duplicates, screenshots, and useless raw files. SnapNext runs continuous, secure background cleanups to compress junk, delete exact replicas, and discover forgotten highlights from 10 years ago.
              </p>
              
              <div className="mt-8 border-t border-purple-950 pt-6">
                <span className="text-xs font-mono text-purple-300">✦ Average user recovers 34% storage within their first 24 hours.</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 11. MULTI-CLOUD SYNC SECTION */}
      <section className="py-24 border-t border-purple-950/60 relative bg-[#07020F]">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest">Universal Connection</span>
          <h2 className="text-3xl md:text-5xl font-black text-white mt-2 mb-6">Bridge all your cloud platforms</h2>
          <p className="text-slate-300 max-w-2xl mx-auto mb-16">
            Say goodbye to storage siloing. Connect your Google Photos, Google Drive, OneDrive, Apple Photos, and Dropbox accounts. SnapNext acts as the master processor layer.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-6 max-w-4xl mx-auto">
            <div className="bg-slate-900/50 border border-purple-950 p-6 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-3xl mb-2">📸</span>
              <span className="text-xs font-bold text-white">Google Photos</span>
            </div>
            <div className="bg-slate-900/50 border border-purple-950 p-6 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-3xl mb-2">📁</span>
              <span className="text-xs font-bold text-white">Google Drive</span>
            </div>
            <div className="bg-slate-900/50 border border-purple-950 p-6 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-3xl mb-2">📦</span>
              <span className="text-xs font-bold text-white">Dropbox</span>
            </div>
            <div className="bg-slate-900/50 border border-purple-950 p-6 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-3xl mb-2">☁️</span>
              <span className="text-xs font-bold text-white">OneDrive</span>
            </div>
            <div className="bg-slate-900/50 border border-purple-950 p-6 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-3xl mb-2">🍎</span>
              <span className="text-xs font-bold text-white">Apple Photos</span>
            </div>
          </div>
        </div>
      </section>

      {/* 12. REAL LIFE USE CASES (Tabs Selector) */}
      <section className="py-24 border-t border-purple-950/60 bg-purple-950/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-purple-400 uppercase tracking-widest">Designed for real life</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-2">When does SnapNext feel like magic?</h2>
            <p className="text-slate-300 mt-4">
              Explore dynamic, high-resonance use cases and discover why standard cloud hard drives can’t compare.
            </p>

            {/* Case Tab buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
              {Object.keys(useCases).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveCaseTab(key)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition duration-200 ${activeCaseTab === key ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-purple-950/50'}`}
                >
                  {useCases[key].title}
                </button>
              ))}
            </div>
          </div>

          {/* Active Case display card */}
          <div className="bg-slate-950 border border-purple-950 rounded-3xl p-8 max-w-4xl mx-auto relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-pink-500/10 to-transparent pointer-events-none" />
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-purple-950 pb-6 mb-6">
              <div>
                <span className="bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-extrabold tracking-widest uppercase px-3 py-1 rounded-full">
                  {useCases[activeCaseTab].badge}
                </span>
                <h3 className="text-2xl font-bold text-white mt-3">{useCases[activeCaseTab].title}</h3>
              </div>
              <p className="text-xs font-mono text-[#10B981] mt-2 md:mt-0">✦ Dynamic delivery optimized</p>
            </div>

            <div className="space-y-6">
              <p className="text-slate-300 text-sm leading-relaxed">{useCases[activeCaseTab].highlight}</p>
              
              <div className="bg-slate-900/60 p-4 rounded-xl border border-purple-950 font-serif italic text-sm text-slate-200">
                "{useCases[activeCaseTab].output}"
              </div>

              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <Clock className="w-4 h-4 text-pink-400" />
                <span>{useCases[activeCaseTab].stat}</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 13. DIGITAL LEGACY (100-Year Vision) */}
      <section className="py-24 border-t border-purple-950/60 relative">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-purple-900/5 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="text-xs font-extrabold text-pink-400 uppercase tracking-widest">Built for eternity</span>
          <h2 className="text-3xl md:text-5xl font-black text-white mt-2">Your Memories Should Outlive You</h2>
          <p className="text-slate-300 max-w-2xl mx-auto mt-4">
            A digital hard drive will go dark if a subscription lapses. SnapNext is engineered with a 100-year legacy protection protocol, preserving your stories for multiple generations.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-4xl mx-auto text-left">
            <div className="bg-slate-900/30 border border-purple-950 p-8 rounded-2xl">
              <span className="text-xs font-mono text-purple-400 font-bold block mb-2">PHASE 01 • TODAY</span>
              <h3 className="text-lg font-bold text-white mb-2">Create & Build</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Secure your high-resolution travel diaries, active life graphs, audio registers, and daily memories safely.</p>
            </div>

            <div className="bg-slate-900/30 border border-purple-950 p-8 rounded-2xl">
              <span className="text-xs font-mono text-purple-400 font-bold block mb-2">PHASE 02 • TOMORROW</span>
              <h3 className="text-lg font-bold text-white mb-2">Children Inherit</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Transfer permissions dynamically. Children inherit full access with cleaned audio notes explaining who was in which photo.</p>
            </div>

            <div className="bg-slate-900/30 border border-purple-950 p-8 rounded-2xl">
              <span className="text-xs font-mono text-purple-400 font-bold block mb-2">PHASE 03 • FUTURE</span>
              <h3 className="text-lg font-bold text-white mb-2">Grandchildren Discover</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Grandchildren can look back 50 years into the past, query the AI, hear recipes, and trace their roots seamlessly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 14. TRUST & SECURITY SECTION */}
      <section id="security" className="py-24 border-t border-purple-950/60 bg-[#07020F]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Trust and security badges */}
            <div className="space-y-6">
              <span className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest">Secured by Design</span>
              <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">
                Your memories belong to you. Private by default.
              </h2>
              <p className="text-slate-300 text-lg">
                Unlike traditional storage giants, we never scan your photos to serve target ads or train external models. Your memories are fully encrypted, biometrically secured, and entirely user-owned.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold text-white">E2E Encryption</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Lock className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Biometric Locks</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Zero Data Selling</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Award className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold text-white">GDPR Compliance</span>
                </div>
              </div>
            </div>

            {/* High-fidelity Security Dashboard Representation */}
            <div className="bg-slate-950 border border-purple-950 rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl" />
              
              <h3 className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-6">SNAPNEXT_CRYPTO_STATUS</h3>

              <div className="space-y-4">
                <div className="bg-slate-900 p-4 rounded-xl flex items-center justify-between border border-purple-950">
                  <span className="text-xs text-slate-300">Vault Access Key (AES-256)</span>
                  <span className="text-xs font-bold text-[#10B981]">FULLY SECURED</span>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl flex items-center justify-between border border-purple-950">
                  <span className="text-xs text-slate-300">Biometric Setup Integration</span>
                  <span className="text-xs font-bold text-[#10B981]">ACTIVE</span>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl flex items-center justify-between border border-purple-950">
                  <span className="text-xs text-slate-300">Anonymous Metadata Shielding</span>
                  <span className="text-xs font-bold text-cyan-400 font-mono">0.0.0.0 CLOAKED</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 mt-6 text-center italic">
                “No metadata is transmitted in readable formats outside the application environment.”
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 15. THE COMPARISON SECTION */}
      <section className="py-24 border-t border-purple-950/60 bg-purple-950/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest">SaaS Rigor Matrix</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-2">Why SnapNext stands apart</h2>
            <p className="text-slate-300 mt-4">
              A comprehensive view of how SnapNext compares to old-school storage hard-drives.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-purple-950/60 text-xs text-slate-400 uppercase font-mono">
                  <th className="py-4 px-6">Feature Details</th>
                  <th className="py-4 px-6 text-purple-400 font-extrabold">SnapNext AI</th>
                  <th className="py-4 px-6">Google Photos</th>
                  <th className="py-4 px-6">Dropbox</th>
                  <th className="py-4 px-6">Instagram</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-purple-950/40 text-slate-300">
                <tr>
                  <td className="py-4 px-6 font-bold">AI Intelligent Life OS Positioning</td>
                  <td className="py-4 px-6 text-[#10B981] font-bold">✓ YES</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold">Relational Life Graph Timeline</td>
                  <td className="py-4 px-6 text-[#10B981] font-bold">✓ YES</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold">Biometrics Family Heritage Vault</td>
                  <td className="py-4 px-6 text-[#10B981] font-bold">✓ YES</td>
                  <td className="py-4 px-6 text-slate-500">❌ Partial</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold">Continuous Duplicate Compression</td>
                  <td className="py-4 px-6 text-[#10B981] font-bold">✓ YES</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold">Auto-Generates Magazines / Journals</td>
                  <td className="py-4 px-6 text-[#10B981] font-bold">✓ YES</td>
                  <td className="py-4 px-6 text-slate-500">❌ Slide shows only</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold">Privacy: Zero AI Model Training on User Data</td>
                  <td className="py-4 px-6 text-[#10B981] font-bold">✓ YES</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                  <td className="py-4 px-6 text-slate-500">❌ NO</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 16. PRICING SECTION (with switcher & currencies) */}
      <section id="pricing" className="py-24 border-t border-purple-950/60 relative">
        <div className="absolute top-1/4 right-0 w-80 h-80 bg-purple-900/10 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-pink-400 uppercase tracking-widest">Fair Transparent pricing</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-2">Choose your storage timeline</h2>
            <p className="text-slate-300 mt-4">
              All plans include complete access to the AI Memory OS, search assistant, and relational graphs.
            </p>

            {/* Currency switcher selector */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              
              {/* Billing Period Switcher */}
              <div className="inline-flex bg-slate-900 p-1 rounded-xl border border-purple-950">
                <button 
                  onClick={() => setBillingPeriod('monthly')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition duration-200 ${billingPeriod === 'monthly' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Monthly
                </button>
                <button 
                  onClick={() => setBillingPeriod('yearly')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition duration-200 ${billingPeriod === 'yearly' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Yearly (Save 20%)
                </button>
              </div>

              {/* Currency Dropdown selector */}
              <div className="flex items-center space-x-2 bg-slate-900 px-3 py-2 rounded-xl border border-purple-950">
                <Globe className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-slate-300">Currency:</span>
                <select 
                  value={activeCurrency}
                  onChange={(e) => setActiveCurrency(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
                >
                  {currencies.map(c => (
                    <option key={c.code} value={c.code} className="bg-slate-950 text-white">
                      {c.code} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Pricing plans cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingPlans.map((plan, idx) => (
              <div 
                key={idx}
                className={`p-6 rounded-3xl border flex flex-col justify-between transition-transform duration-300 relative ${plan.popular ? 'bg-gradient-to-b from-purple-950/40 via-slate-900/60 to-purple-900/20 border-purple-500 scale-105 shadow-xl shadow-purple-900/10' : 'bg-slate-900/30 border-purple-950 hover:border-purple-900/60'}`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-extrabold text-[10px] tracking-widest uppercase px-3 py-1 rounded-full shadow-lg">
                    RECOMMENDED
                  </span>
                )}

                <div>
                  <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">{plan.name}</span>
                  <span className="text-4xl font-black text-white block mt-2">{plan.storage}</span>
                  <p className="text-xs text-slate-400 mt-2">{plan.desc}</p>
                  
                  <div className="my-6 border-y border-purple-950/60 py-4">
                    <span className="text-3xl font-black text-white">{getPrice(plan.basePriceUSD)}</span>
                    {plan.basePriceUSD > 0 && (
                      <span className="text-xs text-slate-500"> / {billingPeriod === 'monthly' ? 'month' : 'year'}</span>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start space-x-2 text-xs text-slate-300">
                        <Check className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link 
                  href="/signup" 
                  className={`w-full py-3 text-center text-xs font-extrabold rounded-xl transition duration-200 ${plan.popular ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 shadow-lg' : 'bg-slate-800 hover:bg-slate-750 text-white'}`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* Pricing detail footnote */}
          <p className="text-center text-xs text-slate-500 mt-12">
            Pricing adjusted globally. Regional taxes or localized subscription options may apply at checkout. No hidden lock-in contract fees.
          </p>

        </div>
      </section>

      {/* 17. GLOBAL LANGUAGES EXPERIENCE SECTION */}
      <section className="py-24 border-t border-purple-950/60 relative">
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-900/10 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Description Info */}
            <div>
              <span className="text-xs font-extrabold text-purple-400 uppercase tracking-widest">Globalized Native Experience</span>
              <h2 className="text-3xl md:text-5xl font-black text-white mt-2 leading-tight">
                Designed for every heritage, worldwide.
              </h2>
              <p className="text-slate-300 mt-6 text-lg leading-relaxed">
                Family stories are written in native accents. SnapNext supports 25 global languages, dynamically translating descriptions, transcription files, family timelines, and AI interfaces natively.
              </p>

              {/* Language grid preview */}
              <div className="mt-8">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">Selected Translation:</span>
                <div className="flex items-center space-x-2 bg-slate-900 px-4 py-3 rounded-xl border border-purple-950 inline-flex">
                  <Globe className="w-4.5 h-4.5 text-pink-500" />
                  <span className="text-sm font-black text-white">{selectedLanguage}</span>
                </div>
              </div>
            </div>

            {/* Quick click selector representing high worldwide presence */}
            <div className="bg-slate-950 border border-purple-950 rounded-3xl p-6 relative">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-widest block mb-4">Supported Global Languages ({languages.length})</span>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                {languages.map((l, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedLanguage(l.name)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition text-left ${selectedLanguage === l.name ? 'bg-purple-950 border border-purple-500 text-purple-300' : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                  >
                    <span className="block text-[10px] uppercase font-mono tracking-wider opacity-60">{l.name}</span>
                    <span className="block mt-0.5">{l.native}</span>
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-slate-500 mt-4 text-center">
                ✦ AI dynamically processes local punctuation, dialects, and emotional inflections.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 18. FUTURE ROADMAP (Holographic timeline) */}
      <section className="py-24 border-t border-purple-950/60 bg-purple-950/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest font-mono">Future Roadmap</span>
          <h2 className="text-3xl md:text-5xl font-black text-white mt-2 mb-16">The 100-Year Life OS Roadmap</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 text-left max-w-5xl mx-auto">
            
            <div className="bg-slate-900/40 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-[10px] text-purple-400 font-mono block mb-2 uppercase tracking-widest font-bold">Q3 2026</span>
              <h3 className="text-white font-bold text-sm mb-1">AI Family Historian</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">Autonomously interviews senior family members with smart conversational prompt sequences.</p>
            </div>

            <div className="bg-slate-900/40 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-[10px] text-purple-400 font-mono block mb-2 uppercase tracking-widest font-bold">Q4 2026</span>
              <h3 className="text-white font-bold text-sm mb-1">AI Voice Memories</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">Clones vocal tones securely so grandbabies can hear grandmother reading diaries natively.</p>
            </div>

            <div className="bg-slate-900/40 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-[10px] text-purple-400 font-mono block mb-2 uppercase tracking-widest font-bold">Q1 2027</span>
              <h3 className="text-white font-bold text-sm mb-1">AI Legacy Vault</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">Smart multi-generational estate distribution mapping for private personal folders and assets.</p>
            </div>

            <div className="bg-slate-900/40 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-[10px] text-purple-400 font-mono block mb-2 uppercase tracking-widest font-bold">Q2 2027</span>
              <h3 className="text-white font-bold text-sm mb-1">Smart Family Tree</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">Automatic linking of generational life timelines based on genetic relations, faces, and names.</p>
            </div>

            <div className="bg-slate-900/40 border border-purple-950 p-6 rounded-2xl relative">
              <span className="text-[10px] text-[#10B981] font-mono block mb-2 uppercase tracking-widest font-bold">FUTURE VISION</span>
              <h3 className="text-white font-bold text-sm mb-1">Memory Time Machine</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">Immersive historical timeline projection mapping using virtual neural network synthesis.</p>
            </div>

          </div>
        </div>
      </section>

      {/* 19. FINAL EMOTIONAL CTA */}
      <section className="py-24 border-t border-purple-950/60 relative bg-gradient-to-t from-purple-950/20 via-[#07020F] to-[#07020F] text-center">
        
        {/* Ambient background glows */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-purple-900/20 rounded-full blur-[140px] pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 relative z-10">
          <span className="text-xs font-extrabold text-pink-400 uppercase tracking-widest">Start your timeline today</span>
          <h2 className="text-4xl md:text-7xl font-black text-white mt-4 leading-none select-none">
            EVERY MEMORY. <br />
            EVERY STORY. <br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">ONE PLACE.</span>
          </h2>
          
          <p className="max-w-xl mx-auto mt-6 text-slate-300 font-light text-base md:text-lg">
            Build your digital life operating system with SnapNext AI. Reclaim your memories from scattered drives and secure your family legacy.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-2xl shadow-xl shadow-purple-950/50 transition transform hover:-translate-y-1">
              Start Your Timeline (Free 15 GB)
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-slate-900 border border-purple-950 hover:border-purple-800 text-white font-bold rounded-2xl transition transform hover:-translate-y-1 flex items-center justify-center space-x-2">
              <Play className="w-4 h-4 text-pink-400 fill-pink-400" />
              <span>Launch App</span>
            </Link>
          </div>

          <p className="mt-6 text-xs text-slate-500 font-mono">
            ✦ Setup in 60 seconds • Works with existing drives • Fully private by design
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-purple-950/60 bg-[#07020F] py-12 relative z-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-xs text-white">
              S
            </div>
            <span className="font-bold text-white">SnapNext AI</span>
            <span>• The Generational Life Operating System</span>
          </div>

          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition">Terms of Service</Link>
            <a href="#security" className="hover:text-white transition">Zero-Knowledge Security</a>
            <span>© 2026 SnapNext AI, Inc. All rights reserved.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
