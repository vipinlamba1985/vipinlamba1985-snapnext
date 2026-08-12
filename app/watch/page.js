'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2, Play, ShieldCheck, Tv } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

function normalizeCode(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

async function viewerFetch(payload) {
  const response = await fetch('/api/family-watch/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || 'Could not connect this screen.');
  return data;
}

function mediaUrl(sessionId, item, accessTokens) {
  const token = accessTokens?.[item?.slot];
  if (!sessionId || !item || !token) return '';
  const params = new URLSearchParams({ session: sessionId, slot: String(item.slot), token });
  return `/api/family-watch/media?${params.toString()}`;
}

function FamilyPlayer({ session, items, accessTokens, viewerSecret, onUpdate }) {
  const [started, setStarted] = useState(false);
  const videoRef = useRef(null);
  const index = Math.min(Math.max(Number(session?.playback?.index || 0), 0), Math.max(0, items.length - 1));
  const item = items[index] || null;
  const playing = session?.playback?.playing !== false;
  const src = mediaUrl(session?.id, item, accessTokens);

  async function advance() {
    if (!session?.id || !viewerSecret) return;
    try {
      const next = await viewerFetch({ action: 'advance', id: session.id, viewerSecret });
      onUpdate(next);
    } catch {}
  }

  useEffect(() => {
    if (!started || !item || item.kind !== 'photo' || !playing) return undefined;
    const timer = setTimeout(() => { void advance(); }, 8000);
    return () => clearTimeout(timer);
  }, [started, item?.slot, playing, session?.playback?.revision]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !started || item?.kind !== 'video') return;
    if (playing) video.play().catch(() => null);
    else video.pause();
  }, [started, item?.slot, playing, src]);

  if (!item) return <div className="grid min-h-screen place-items-center bg-black text-white/60">This story has no available photos or videos.</div>;

  if (!started) {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
        <div className="max-w-xl text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/10"><Tv className="h-10 w-10" /></div>
          <p className="mt-6 text-sm font-black uppercase tracking-[0.22em] text-white/45">Screen connected</p>
          <h1 className="mt-3 text-4xl font-black md:text-6xl">{session.title}</h1>
          <p className="mt-4 text-lg text-white/55">{session.itemCount} memories are ready. Keep the phone nearby as your remote.</p>
          <button onClick={() => setStarted(true)} className="mt-8 inline-flex min-h-14 items-center gap-3 rounded-full bg-white px-7 text-base font-black text-black"><Play className="h-5 w-5 fill-black" />Start family story</button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white" onDoubleClick={advance}>
      <div className="absolute inset-0">
        {item.kind === 'video' ? (
          <video ref={videoRef} key={item.slot} src={src} className="h-screen w-screen object-contain" playsInline preload="auto" onEnded={advance} />
        ) : (
          <img key={item.slot} src={src} alt={item.name || 'Family memory'} className="h-screen w-screen object-contain" />
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 p-6 md:p-10">
        <div className="flex items-center gap-3"><BrandLogo size={38} /><span className="font-black">SnapNext Family Story</span></div>
        <div className="rounded-full bg-black/45 px-4 py-2 text-sm font-bold backdrop-blur">{index + 1} / {items.length}</div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
        <div className="max-w-3xl rounded-3xl bg-black/45 p-5 backdrop-blur-md">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{session.title}</p>
          <h2 className="mt-2 text-2xl font-black md:text-4xl">{item.name || 'A family memory'}</h2>
          {item.createdAt && <p className="mt-2 text-sm text-white/55">{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
        </div>
      </div>
    </main>
  );
}

export default function FamilyWatchPage() {
  const [pairCode, setPairCode] = useState('');
  const [session, setSession] = useState(null);
  const [viewerSecret, setViewerSecret] = useState('');
  const [accessTokens, setAccessTokens] = useState([]);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('snapnext_family_watch') || 'null');
      if (saved?.id && saved?.viewerSecret && Array.isArray(saved?.accessTokens)) {
        setSession({ id: saved.id, status: 'claimed', title: 'Family story', playback: { index: 0, playing: true } });
        setViewerSecret(saved.viewerSecret);
        setAccessTokens(saved.accessTokens);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!session?.id || !viewerSecret || ['ended', 'expired'].includes(session.status)) return undefined;
    let active = true;
    async function poll() {
      try {
        const data = await viewerFetch({ action: 'status', id: session.id, viewerSecret });
        if (!active) return;
        setSession(data.session);
        setItems(Array.isArray(data.items) ? data.items : []);
        if (data.session?.status === 'approved' && !data.session?.viewerReady) {
          const ready = await viewerFetch({ action: 'ready', id: session.id, viewerSecret });
          if (!active) return;
          setSession(ready.session);
          setItems(Array.isArray(ready.items) ? ready.items : []);
        }
      } catch (nextError) {
        if (active) setError(nextError.message || 'The family session ended.');
      }
    }
    void poll();
    const timer = setInterval(poll, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [session?.id, viewerSecret, session?.status]);

  async function claim(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await viewerFetch({ action: 'claim', pairCode });
      setSession(data.session);
      setViewerSecret(data.viewerSecret);
      setAccessTokens(data.mediaAccessTokens || []);
      sessionStorage.setItem('snapnext_family_watch', JSON.stringify({ id: data.session.id, viewerSecret: data.viewerSecret, accessTokens: data.mediaAccessTokens || [] }));
    } catch (nextError) {
      setError(nextError.message || 'Could not connect this screen.');
    } finally {
      setBusy(false);
    }
  }

  if (session?.status === 'approved' && items.length) {
    return <FamilyPlayer session={session} items={items} accessTokens={accessTokens} viewerSecret={viewerSecret} onUpdate={(data) => { setSession(data.session); setItems(data.items || items); }} />;
  }

  if (session?.status === 'ended' || session?.status === 'expired') {
    return <main className="grid min-h-screen place-items-center bg-black px-6 text-center text-white"><div><BrandLogo size={64} /><h1 className="mt-6 text-4xl font-black">Family story finished</h1><p className="mt-3 text-white/50">Start another Watch together session from Home whenever you want.</p><Link href="/" className="mt-7 inline-flex rounded-full bg-white px-6 py-3 font-black text-black">Back to SnapNext</Link></div></main>;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#07020f] px-6 py-10 text-white">
      <div className="w-full max-w-xl text-center">
        <BrandLogo size={64} priority />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200/60">SnapNext Family Story</p>
        <h1 className="mt-3 text-4xl font-black md:text-5xl">Watch memories together</h1>
        {!session ? <>
          <p className="mt-4 text-base leading-7 text-white/55">On a phone, open Home → Watch together. Enter the code shown there on this TV, computer, or large screen.</p>
          <form onSubmit={claim} className="mx-auto mt-8 max-w-md">
            <input value={pairCode} onChange={(event) => setPairCode(normalizeCode(event.target.value))} autoComplete="one-time-code" autoCapitalize="characters" spellCheck="false" placeholder="ABCD-EFGH" className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-5 text-center font-mono text-3xl font-black uppercase tracking-[0.16em] outline-none focus:border-fuchsia-300/50" />
            <button disabled={busy || pairCode.replace(/\W/g, '').length !== 8} className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-pink-400 px-6 font-black text-black disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Tv className="h-5 w-5" />}Connect this screen</button>
          </form>
        </> : <div className="mx-auto mt-8 max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.04] p-7">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-fuchsia-200" />
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-white/45">Check the phone</p>
          <div className="mt-3 font-mono text-5xl font-black tracking-widest">{session.verificationCode || '--- ---'}</div>
          <p className="mt-4 text-sm leading-6 text-white/55">Make sure this same code appears on the phone, then approve the screen there. No SnapNext password or media is transferred through this code.</p>
        </div>}
        {error && <div className="mx-auto mt-5 max-w-md rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
        <div className="mx-auto mt-8 flex max-w-md items-start gap-3 text-left text-xs leading-5 text-white/35"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />The screen receives temporary access only to the memories in this Watch together session. Access expires automatically.</div>
      </div>
    </main>
  );
}
