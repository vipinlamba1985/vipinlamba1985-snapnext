'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Coins, ImageIcon, Loader2, Save, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, mediaSrc } from '@/lib/api-client';

function money(amount, currency = 'usd') {
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: String(currency).toUpperCase() }).format(Number(amount || 0));
  } catch {
    return `${Number(amount || 0).toFixed(2)} ${String(currency).toUpperCase()}`;
  }
}

export default function PhotoRestorationPage() {
  const [catalog, setCatalog] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [recipeId, setRecipeId] = useState('repair');
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState('');

  const selectedPhoto = useMemo(() => photos.find((photo) => photo.id === selectedId) || null, [photos, selectedId]);
  const recipe = useMemo(() => catalog?.recipes?.find((item) => item.id === recipeId) || null, [catalog, recipeId]);

  async function load() {
    const [restoration, media] = await Promise.all([
      apiFetch('/restoration'),
      apiFetch('/media?filter=photo'),
    ]);
    setCatalog(restoration);
    setPhotos((media.items || []).slice(0, 40));
    if (!selectedId && media.items?.[0]?.id) setSelectedId(media.items[0].id);
    if (!job) {
      const latest = restoration.jobs?.find((item) => ['completed', 'saved'].includes(item.status));
      if (latest) setJob(latest);
    }
  }

  useEffect(() => {
    load().catch((error) => toast.error(error.message || 'Photo Restoration could not load.'));
    const params = new URLSearchParams(window.location.search);
    if (params.get('purchase') === 'success') toast.success('Restoration Credits added.');
    if (params.get('purchase') === 'cancelled') toast.message('Purchase cancelled.');
  }, []);

  async function buyPack(packId) {
    if (!catalog?.providerReady) {
      toast.error('Photo Restoration is still being activated, so purchases are paused.');
      return;
    }
    setBusy(`pack:${packId}`);
    try {
      const result = await apiFetch('/restoration-packs', {
        method: 'POST',
        body: JSON.stringify({ packId }),
      });
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      if (result.mock) {
        toast.success('Test Restoration Credits added.');
        await load();
      }
    } catch (error) {
      toast.error(error.message || 'Checkout could not start.');
    } finally {
      setBusy('');
    }
  }

  async function restore() {
    if (!selectedId || !recipe) return;
    if (!catalog?.providerReady) {
      toast.error('Photo Restoration is being activated. No Credits were used.');
      return;
    }
    if ((catalog.wallet?.availableUnits || 0) < recipe.units) {
      toast.error(`You need ${recipe.units} Restoration Credit${recipe.units === 1 ? '' : 's'} for this option.`);
      return;
    }
    const confirmed = window.confirm(
      `Use ${recipe.units} Restoration Credit${recipe.units === 1 ? '' : 's'} for “${recipe.name}”? Your original photo will stay untouched.`,
    );
    if (!confirmed) return;

    setBusy('restore');
    try {
      const result = await apiFetch('/restoration', {
        method: 'POST',
        body: JSON.stringify({ operation: 'create', mediaId: selectedId, recipeId, approved: true }),
      });
      setJob(result.job);
      setCatalog((current) => ({ ...current, wallet: result.wallet }));
      toast.success('Restoration ready. Review it before saving.');
    } catch (error) {
      toast.error(error.message || 'Restoration could not be completed. No Restoration Credits were used.');
      await load().catch(() => null);
    } finally {
      setBusy('');
    }
  }

  async function saveCopy() {
    if (!job?.id) return;
    setBusy('save');
    try {
      const result = await apiFetch('/restoration', {
        method: 'POST',
        body: JSON.stringify({ operation: 'save', jobId: job.id }),
      });
      setJob((current) => ({ ...current, status: 'saved', savedMediaId: result.mediaId }));
      toast.success(result.message || 'Restored copy saved.');
    } catch (error) {
      toast.error(error.message || 'The restored copy could not be saved.');
    } finally {
      setBusy('');
    }
  }

  const walletUnits = catalog?.wallet?.availableUnits || 0;
  const resultSrc = job?.savedMediaId ? mediaSrc(job.savedMediaId) : job?.outputUrl;
  const originalSrc = job?.mediaId ? mediaSrc(job.mediaId) : selectedId ? mediaSrc(selectedId) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-32 md:pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/ai-studio" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 text-sm font-bold text-white/65"><ArrowLeft className="h-4 w-4" />SnapNext Create</Link>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/15 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-100"><WandSparkles className="h-3.5 w-3.5" />Memory Restoration</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Bring an important memory back to life.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50 md:text-base">Repair an old family photo without replacing the original. Every saved result becomes a separate copy in your private library.</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-right">
          <div className="flex items-center gap-2 text-sm font-black"><Coins className="h-4 w-4 text-amber-200" />{walletUnits} Restoration Credit{walletUnits === 1 ? '' : 's'}</div>
          <div className="mt-1 text-xs text-white/40">Separate from weekly AI allowance</div>
        </div>
      </header>

      {!catalog?.providerReady && (
        <section className="rounded-3xl border border-amber-300/15 bg-amber-500/[0.07] p-5">
          <h2 className="font-black">Provider activation in progress</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">Restoration purchases and processing are paused until the production restoration provider is connected. Your existing photos and editing tools remain available.</p>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-5 md:p-6">
          <div className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-amber-200" /><h2 className="text-xl font-black">1. Choose a photo</h2></div>
          {photos.length ? (
            <div className="mt-5 grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5">
              {photos.map((photo) => (
                <button key={photo.id} onClick={() => { setSelectedId(photo.id); setJob(null); }} className={`relative aspect-square overflow-hidden rounded-2xl border-2 ${selectedId === photo.id ? 'border-amber-300' : 'border-transparent'}`}>
                  <img src={mediaSrc(photo.id)} alt={photo.name || 'Saved memory'} className="h-full w-full object-cover" />
                  {selectedId === photo.id && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-amber-300 text-black"><Check className="h-4 w-4" /></span>}
                </button>
              ))}
            </div>
          ) : (
            <Link href="/upload" className="mt-5 block rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/50">Upload an old family photo to begin.</Link>
          )}
        </div>

        <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-5 md:p-6">
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-200" /><h2 className="text-xl font-black">2. Choose the result</h2></div>
          <div className="mt-5 space-y-2">
            {(catalog?.recipes || []).map((item) => (
              <button key={item.id} onClick={() => setRecipeId(item.id)} className={`w-full rounded-2xl border p-4 text-left transition ${recipeId === item.id ? 'border-amber-300/50 bg-amber-500/10' : 'border-white/8 bg-black/15 hover:bg-white/[0.04]'}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="font-black">{item.name}</div><p className="mt-1 text-sm leading-5 text-white/45">{item.description}</p></div><span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/55">{item.units} Credit{item.units === 1 ? '' : 's'}</span></div>
              </button>
            ))}
          </div>
          <button onClick={restore} disabled={!selectedPhoto || busy === 'restore' || !catalog?.providerReady} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-45">
            {busy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            Restore for {recipe?.units || 1} Credit{recipe?.units === 1 ? '' : 's'}
          </button>
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-500/[0.07] p-3 text-xs leading-5 text-emerald-50/70"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Identity preservation is requested from the provider. SnapNext never overwrites or auto-shares the original.</div>
        </div>
      </section>

      {job && resultSrc && (
        <section className="rounded-[2rem] border border-emerald-300/15 bg-emerald-500/[0.045] p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-black">Before and after</h2><p className="mt-1 text-sm text-white/45">Review the result. Saving creates a separate photo.</p></div><span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-100">{job.recipeName || 'Restored'}</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <figure className="overflow-hidden rounded-3xl border border-white/8 bg-black/20"><div className="px-4 py-3 text-xs font-black uppercase tracking-wider text-white/45">Original</div>{originalSrc && <img src={originalSrc} alt="Original memory" className="max-h-[34rem] w-full object-contain" />}</figure>
            <figure className="overflow-hidden rounded-3xl border border-emerald-300/15 bg-black/20"><div className="px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-100/70">Restored copy</div><img src={resultSrc} alt="Restored memory preview" className="max-h-[34rem] w-full object-contain" /></figure>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={saveCopy} disabled={busy === 'save' || job.status === 'saved'} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black disabled:opacity-50">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{job.status === 'saved' ? 'Saved in SnapNext' : 'Save restored copy'}</button>
            {job.savedMediaId && <Link href="/gallery" className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 text-sm font-bold text-white/70">Open gallery</Link>}
          </div>
        </section>
      )}

      <section className="rounded-[2rem] border border-white/8 bg-white/[0.025] p-5 md:p-6">
        <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-amber-200" /><h2 className="text-xl font-black">Restoration Credit packs</h2></div>
        <p className="mt-2 text-sm text-white/45">One basic restoration uses one Credit. Premium repair and print preparation uses two. Packs do not expire in this MVP.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {(catalog?.packs || []).map((pack) => (
            <div key={pack.id} className={`rounded-3xl border p-5 ${pack.recommended ? 'border-amber-300/25 bg-amber-500/[0.06]' : 'border-white/8 bg-black/15'}`}>
              {pack.recommended && <div className="mb-3 text-xs font-black uppercase tracking-wider text-amber-200">Best first bundle</div>}
              <h3 className="text-lg font-black">{pack.name}</h3>
              <p className="mt-1 min-h-10 text-sm leading-5 text-white/45">{pack.description}</p>
              <div className="mt-4 text-2xl font-black">{money(pack.amount, pack.currency)}</div>
              <div className="mt-1 text-xs text-white/40">{pack.units} Restoration Credit{pack.units === 1 ? '' : 's'}</div>
              <button onClick={() => buyPack(pack.id)} disabled={busy === `pack:${pack.id}` || !catalog?.checkoutReady || !catalog?.providerReady} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-black disabled:opacity-40">{busy === `pack:${pack.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}Buy pack</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
