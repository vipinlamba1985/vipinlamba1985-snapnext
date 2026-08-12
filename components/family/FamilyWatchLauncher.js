'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cast, Loader2, Pause, Play, ShieldCheck, SkipBack, SkipForward, Tv, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  addNativeFamilyCastEndedListener,
  disconnectNativeFamilyCast,
  loadNativeFamilyCastMedia,
  nativeFamilyCastCapability,
  nativeFamilyCastState,
  pauseNativeFamilyCast,
  playNativeFamilyCast,
  presentNativeFamilyCastPicker,
  stopNativeFamilyCast,
} from '@/lib/native/family-cast';

function uniqueMediaItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item?.id || !['photo', 'video'].includes(item.kind) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
      id: item.id,
      kind: item.kind,
      name: item.name || item.title || 'Family memory',
      createdAt: item.createdAt || item.date || null,
    });
    if (out.length >= 40) break;
  }
  return out;
}

function homeSource(data) {
  const onThisDay = Array.isArray(data?.onThisDay) ? data.onThisDay : [];
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const groupItems = groups.slice(0, 4).flatMap((group) => Array.isArray(group?.items) ? group.items : []);
  const items = uniqueMediaItems([...onThisDay, ...groupItems]);
  return {
    items,
    mediaIds: items.map((item) => item.id),
    title: onThisDay.length > 1 ? 'Today in your life' : 'Your recent story',
    description: onThisDay.length > 1
      ? `${onThisDay.length} memories from this day plus recent moments, ready for the big screen.`
      : `${items.length} recent memories ready to watch together.`,
  };
}

function storySource(data) {
  const story = Array.isArray(data?.stories) ? data.stories[0] : null;
  const items = uniqueMediaItems((story?.sources || []).map((source) => ({
    id: source.id,
    kind: source.kind,
    name: source.name,
    createdAt: source.date,
  })));
  return {
    items,
    mediaIds: items.map((item) => item.id),
    title: story?.title || 'Your grounded memory story',
    description: story ? `${items.length} grounded source memories are ready to watch together.` : 'Create a grounded story first, then watch its source memories together.',
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForNativeRoute(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await nativeFamilyCastState();
    if (state.connected) return state;
    await wait(750);
  }
  return null;
}

export default function FamilyWatchLauncher({ mode = 'home' }) {
  const [source, setSource] = useState({ items: [], mediaIds: [], title: 'Family memories', description: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  const [creatorSecret, setCreatorSecret] = useState('');
  const [watchUrl, setWatchUrl] = useState('');
  const [nativeItems, setNativeItems] = useState([]);
  const [nativeCapability, setNativeCapability] = useState({ supported: false });
  const [nativeDevice, setNativeDevice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const path = mode === 'story' ? '/memory-stories' : '/memories';
    apiFetch(path)
      .then((data) => { if (active) setSource(mode === 'story' ? storySource(data) : homeSource(data)); })
      .catch(() => null)
      .finally(() => { if (active) setLoading(false); });
    nativeFamilyCastCapability().then((capability) => { if (active) setNativeCapability(capability); }).catch(() => null);
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    if (!session?.id || ['ended', 'expired'].includes(session.status)) return undefined;
    let active = true;
    async function poll() {
      try {
        const data = await apiFetch(`/family-watch?id=${encodeURIComponent(session.id)}`);
        if (active && data?.session) setSession(data.session);
      } catch {}
    }
    const timer = setInterval(poll, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [session?.id, session?.status]);

  const isNativeSession = session?.transport === 'google-cast' || session?.transport === 'airplay';
  const canStart = !loading && source.mediaIds.length > 0;
  const connected = session?.status === 'claimed' || session?.status === 'approved';
  const approved = session?.status === 'approved';
  const displayWatchUrl = useMemo(() => String(watchUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, ''), [watchUrl]);
  const nativeEligibleItems = useMemo(() => {
    if (!nativeCapability?.supported) return [];
    if (nativeCapability.supportsPhotos) return source.items;
    return source.items.filter((item) => item.kind === 'video');
  }, [nativeCapability, source.items]);
  const sourceHasPhotos = source.items.some((item) => item.kind === 'photo');
  const currentNativeItem = isNativeSession ? nativeItems[Number(session?.playback?.index || 0)] || null : null;

  useEffect(() => {
    if (!isNativeSession || !session?.id || !creatorSecret || !approved) return undefined;
    let listenerHandle = null;
    let active = true;
    addNativeFamilyCastEndedListener(() => {
      if (active) void act('next');
    }).then((handle) => { listenerHandle = handle; }).catch(() => null);
    return () => {
      active = false;
      try { listenerHandle?.remove?.(); } catch {}
    };
  }, [isNativeSession, session?.id, creatorSecret, approved]);

  useEffect(() => {
    if (!isNativeSession || session?.transport !== 'google-cast' || !approved || !currentNativeItem || currentNativeItem.kind !== 'photo' || session?.playback?.playing === false) return undefined;
    const timer = setTimeout(() => { void act('next'); }, 8000);
    return () => clearTimeout(timer);
  }, [isNativeSession, session?.transport, approved, currentNativeItem?.slot, session?.playback?.playing, session?.playback?.revision]);

  useEffect(() => {
    if (!isNativeSession || !approved) return undefined;
    let active = true;
    async function refreshRoute() {
      const state = await nativeFamilyCastState();
      if (!active) return;
      setNativeDevice(state.connected ? (state.deviceName || (session.transport === 'airplay' ? 'AirPlay' : 'Cast device')) : '');
    }
    void refreshRoute();
    const timer = setInterval(refreshRoute, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [isNativeSession, approved, session?.transport]);

  useEffect(() => {
    if (!isNativeSession || !['ended', 'expired'].includes(session?.status)) return;
    void disconnectNativeFamilyCast().catch(() => null);
    setNativeItems([]);
    setNativeDevice('');
  }, [isNativeSession, session?.status]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/family-watch', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', mediaIds: source.mediaIds, title: source.title }),
      });
      setSession(data.session);
      setCreatorSecret(data.creatorSecret);
      setWatchUrl(data.watchUrl);
      setNativeItems([]);
      setNativeDevice('');
    } catch (nextError) {
      setError(nextError.message || 'Could not start Watch together.');
    } finally {
      setBusy(false);
    }
  }

  async function createNativeSession() {
    return apiFetch('/family-watch', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-native',
        mediaIds: nativeEligibleItems.map((item) => item.id),
        title: source.title,
        transport: nativeCapability.transport,
      }),
    });
  }

  async function endNativeSessionQuietly(data) {
    try {
      if (data?.session?.id && data?.creatorSecret) {
        await apiFetch('/family-watch', {
          method: 'POST',
          body: JSON.stringify({ action: 'end', id: data.session.id, creatorSecret: data.creatorSecret }),
        });
      }
    } catch {}
    try { await stopNativeFamilyCast(); } catch {}
    try { await disconnectNativeFamilyCast(); } catch {}
  }

  async function startNative() {
    if (!nativeCapability?.supported || !nativeEligibleItems.length) {
      setError(nativeCapability?.transport === 'airplay'
        ? 'This story has no videos for direct AirPlay. Use Watch together for the full story.'
        : 'Native TV casting is unavailable on this device.');
      return;
    }

    setBusy(true);
    setError('');
    let created = null;
    try {
      if (nativeCapability.transport === 'google-cast') {
        await presentNativeFamilyCastPicker({ prefersVideo: true });
        const route = await waitForNativeRoute();
        if (!route) throw new Error('No Cast TV was selected. You can still use Watch together with any TV browser.');
        created = await createNativeSession();
        setSession(created.session);
        setCreatorSecret(created.creatorSecret);
        setNativeItems(created.items || []);
        setNativeDevice(route.deviceName || 'Cast device');
        setWatchUrl('');
        if (created.items?.[0]) await loadNativeFamilyCastMedia(created.items[0], { autoplay: true });
        return;
      }

      // AirPlay needs an AVPlayer item before the system can route its video.
      // The server already enforces video-only items for this direct transport.
      created = await createNativeSession();
      setSession(created.session);
      setCreatorSecret(created.creatorSecret);
      setNativeItems(created.items || []);
      setWatchUrl('');
      if (created.items?.[0]) await loadNativeFamilyCastMedia(created.items[0], { autoplay: false });
      await presentNativeFamilyCastPicker({ prefersVideo: true });
      const route = await waitForNativeRoute();
      if (!route) {
        await endNativeSessionQuietly(created);
        setSession(null);
        setCreatorSecret('');
        setNativeItems([]);
        throw new Error('No AirPlay TV was selected. Use Watch together to keep the complete photo/video story.');
      }
      setNativeDevice(route.deviceName || 'AirPlay');
      await playNativeFamilyCast();
    } catch (nextError) {
      if (created && nativeCapability.transport === 'google-cast') await endNativeSessionQuietly(created);
      setError(nextError.message || 'Could not start native TV playback.');
    } finally {
      setBusy(false);
    }
  }

  async function syncNativePlayback(action, nextSession) {
    if (!isNativeSession) return;
    if (action === 'play') return playNativeFamilyCast();
    if (action === 'pause') return pauseNativeFamilyCast();
    if (action === 'end') return disconnectNativeFamilyCast();
    if (action === 'next' || action === 'previous') {
      const item = nativeItems[Number(nextSession?.playback?.index || 0)];
      if (item) return loadNativeFamilyCastMedia(item, { autoplay: nextSession?.playback?.playing !== false });
    }
  }

  async function act(action) {
    if (!session?.id || !creatorSecret) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/family-watch', {
        method: 'POST',
        body: JSON.stringify({ action, id: session.id, creatorSecret }),
      });
      if (data?.session) setSession(data.session);
      if (isNativeSession && data?.session) await syncNativePlayback(action, data.session);
      if (action === 'end') {
        setCreatorSecret('');
        setWatchUrl('');
        setNativeItems([]);
        setNativeDevice('');
      }
    } catch (nextError) {
      setError(nextError.message || 'Watch together could not update.');
    } finally {
      setBusy(false);
    }
  }

  async function changeNativeRoute() {
    setError('');
    try {
      await presentNativeFamilyCastPicker({ prefersVideo: true });
    } catch (nextError) {
      setError(nextError.message || 'Could not open the TV picker.');
    }
  }

  return (
    <>
      <section data-testid={`family-watch-launcher-${mode}`} className="rounded-[2rem] border border-violet-300/15 bg-gradient-to-br from-violet-500/12 via-fuchsia-500/8 to-cyan-500/8 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-violet-100"><Tv className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-100/60">Family Story</p>
            <h2 className="mt-1 text-xl font-black text-white">Watch together on a bigger screen</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">{loading ? 'Preparing your real memories…' : source.description}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button data-testid="family-watch-start" onClick={start} disabled={!canStart || busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tv className="h-4 w-4" />}
            Watch together
          </button>
          {nativeCapability?.supported && nativeEligibleItems.length > 0 && (
            <button data-testid="family-watch-native-start" onClick={startNative} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-sm font-black text-white disabled:opacity-40">
              <Cast className="h-4 w-4" />
              {nativeCapability.transport === 'google-cast' ? 'Cast to TV' : 'AirPlay videos'}
            </button>
          )}
          <span className="text-xs font-semibold text-white/35">Watch together works with any TV browser or computer.</span>
        </div>
        {nativeCapability?.supported && nativeCapability.transport === 'google-cast' && <p className="mt-3 text-xs leading-5 text-white/35">Android native Cast sends this temporary Family Story directly to a Cast-enabled TV. Photos and videos stay session-scoped.</p>}
        {nativeCapability?.supported && nativeCapability.transport === 'airplay' && <p className="mt-3 text-xs leading-5 text-white/35">AirPlay direct playback handles video memories. {sourceHasPhotos ? 'Use Watch together above to keep the complete photo + video story.' : 'This story is video-only, so AirPlay can play the full selection.'}</p>}
        {error && !session && <p className="mt-3 text-sm text-rose-200">{error}</p>}
      </section>

      {session && !['ended', 'expired'].includes(session.status) && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <section role="dialog" aria-modal="true" aria-label="Watch together controller" className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#120b1d] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200/60">{isNativeSession ? (session.transport === 'google-cast' ? 'Google Cast' : 'AirPlay') : 'Watch together'}</p><h2 className="mt-1 text-2xl font-black">{session.title}</h2></div>
              <button onClick={() => void act('end')} aria-label="End Watch together" className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><X className="h-5 w-5" /></button>
            </div>

            {!isNativeSession && (
              <>
                <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">On the TV or big screen open</p>
                  <p className="mt-2 break-all text-lg font-black text-cyan-100">{displayWatchUrl || 'snapnext.ai/watch'}</p>
                  <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-white/40">Enter this pairing code</p>
                  <div className="mt-2 font-mono text-4xl font-black tracking-[0.14em]">{session.pairCode}</div>
                </div>

                {session.status === 'pending' && <p className="mt-5 text-center text-sm text-white/50">Waiting for the big screen to enter the code…</p>}

                {connected && (
                  <div className="mt-5 rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.06] p-5 text-center">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100/60">Match this code on both screens</p>
                    <div className="mt-2 font-mono text-5xl font-black tracking-widest text-emerald-50">{session.verificationCode}</div>
                    {session.status === 'claimed' && <button onClick={() => void act('approve')} disabled={busy} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-200 px-6 text-sm font-black text-emerald-950 disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Approve this screen</button>}
                  </div>
                )}
              </>
            )}

            {isNativeSession && approved && (
              <div className="mt-5 rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.06] p-5">
                <div className="flex items-center gap-3"><Cast className="h-5 w-5 text-cyan-100" /><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/55">Connected screen</p><p className="truncate font-black text-cyan-50">{nativeDevice || (session.transport === 'airplay' ? 'AirPlay route' : 'Cast device')}</p></div><button onClick={changeNativeRoute} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/70">Change</button></div>
              </div>
            )}

            {approved && (
              <div className="mt-5">
                <div className="flex items-center justify-center gap-3">
                  <button onClick={() => void act('previous')} disabled={busy} aria-label="Previous memory" className="grid h-12 w-12 place-items-center rounded-full bg-white/8 disabled:opacity-40"><SkipBack className="h-5 w-5" /></button>
                  <button onClick={() => void act(session.playback?.playing === false ? 'play' : 'pause')} disabled={busy} aria-label={session.playback?.playing === false ? 'Play' : 'Pause'} className="grid h-14 w-14 place-items-center rounded-full bg-white text-black disabled:opacity-40">{session.playback?.playing === false ? <Play className="h-6 w-6 fill-black" /> : <Pause className="h-6 w-6 fill-black" />}</button>
                  <button onClick={() => void act('next')} disabled={busy} aria-label="Next memory" className="grid h-12 w-12 place-items-center rounded-full bg-white/8 disabled:opacity-40"><SkipForward className="h-5 w-5" /></button>
                </div>
                <p className="mt-4 text-center text-sm text-white/45">Memory {Number(session.playback?.index || 0) + 1} of {session.itemCount}{!isNativeSession && (session.viewerReadyAt ? ' · screen ready' : ' · waiting for screen to start')}</p>
                {isNativeSession && currentNativeItem && <p className="mt-2 truncate text-center text-xs font-semibold text-white/35">{currentNativeItem.name}</p>}
              </div>
            )}

            {error && <p className="mt-4 rounded-2xl bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
            <p className="mt-5 text-xs leading-5 text-white/35">{isNativeSession ? 'The TV receives temporary URLs for only this Family Story. Ending the session invalidates them; your SnapNext login never leaves this device.' : 'Only this temporary story is available to the connected screen. The session expires automatically and does not transfer your SnapNext login.'}</p>
          </section>
        </div>
      )}
    </>
  );
}
