'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Copy, Download, Images, Loader2, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, mediaSrc } from '@/lib/api-client';

function StoryCollage({ ids = [] }) {
  const visible = ids.slice(0, 4);
  return <div className={`grid aspect-square overflow-hidden rounded-[2rem] bg-black ${visible.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-0.5`}>{visible.map((id, index) => <div key={id} className={`overflow-hidden ${visible.length === 3 && index === 2 ? 'col-span-2' : ''}`}><img src={mediaSrc(id)} alt="" className="h-full w-full object-cover" /></div>)}</div>;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read one of the story photos.')); };
    image.src = url;
  });
}

function drawCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function cellsFor(count, size) {
  const half = size / 2;
  if (count <= 1) return [[0, 0, size, size]];
  if (count === 2) return [[0, 0, half, size], [half, 0, half, size]];
  if (count === 3) return [[0, 0, size, half], [0, half, half, half], [half, half, half, half]];
  return [[0, 0, half, half], [half, 0, half, half], [0, half, half, half], [half, half, half, half]];
}

async function buildCollageBlob(ids) {
  const selected = ids.slice(0, 4);
  if (!selected.length) throw new Error('This story has no photos to export.');
  const blobs = await Promise.all(selected.map(async id => {
    const response = await fetch(mediaSrc(id), { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not load one of the story photos.');
    return response.blob();
  }));
  const images = await Promise.all(blobs.map(loadImage));
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the collage.');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const cells = cellsFor(images.length, size);
  images.forEach((image, index) => drawCover(ctx, image, ...cells[index]));
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the collage file.')), 'image/jpeg', 0.9));
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReadyStoryEditor({ storyId }) {
  const [story, setStory] = useState(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch(`/ready-story-drafts?id=${encodeURIComponent(storyId)}`).then(data => {
      if (!active) return;
      setStory(data.story || null);
      setCaption(data.story?.caption || '');
      apiFetch('/ready-story-drafts', { method: 'POST', body: JSON.stringify({ action: 'mark-reviewed', id: storyId }) }).catch(() => {});
    }).catch(error => toast.error(error.message || 'Could not open this story.')).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storyId]);

  async function copyPost() {
    await navigator.clipboard.writeText(caption.trim());
    toast.success('Story caption copied.');
  }

  async function exportCollage() {
    setBusy('export');
    try {
      const blob = await buildCollageBlob(story?.collageMediaIds || story?.mediaIds || []);
      saveBlob(blob, `${String(story?.title || 'snapnext-story').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.jpg`);
      toast.success('Collage ready to save or post.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }

  async function shareStory() {
    setBusy('share');
    try {
      const blob = await buildCollageBlob(story?.collageMediaIds || story?.mediaIds || []);
      const file = new File([blob], 'snapnext-story.jpg', { type: 'image/jpeg' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: story?.title || 'SnapNext story', text: caption.trim(), files: [file] });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: story?.title || 'SnapNext story', text: caption.trim() });
        return;
      }
      await navigator.clipboard.writeText(caption.trim());
      toast.success('Sharing is not available here, so the caption was copied.');
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error(error.message || 'Could not share this story.');
    } finally { setBusy(''); }
  }

  if (loading) return <div className="mx-auto max-w-5xl py-12"><div className="h-[520px] animate-pulse rounded-[2rem] bg-white/[0.04]" /></div>;
  if (!story) return <div className="mx-auto max-w-2xl py-16 text-center"><Images className="mx-auto h-10 w-10 text-white/25" /><h1 className="mt-4 text-2xl font-black">This ready story is no longer available</h1><Link href="/dashboard" className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-black">Back to Home</Link></div>;

  const ids = story.collageMediaIds?.length ? story.collageMediaIds : story.mediaIds || [];
  return <div className="mx-auto max-w-5xl space-y-5 pb-28">
    <header><div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-pink-200/75"><Sparkles className="h-3.5 w-3.5" />Ready story</div><h1 className="mt-2 text-3xl font-black tracking-tight">{story.title}</h1><p className="mt-2 text-sm text-white/50">{story.kicker} · {story.sourceCount} saved moments · private until you choose to share.</p></header>
    <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <StoryCollage ids={ids} />
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/8 px-3 py-1.5 text-xs font-bold text-emerald-100"><Check className="h-3.5 w-3.5" />Prepared without a new AI generation</div>
        <label className="mt-5 block text-xs font-black uppercase tracking-wider text-white/45">Caption</label>
        <textarea value={caption} onChange={event => setCaption(event.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-pink-300/30" />
        <p className="mt-2 text-xs leading-5 text-white/38">Edit anything you want. SnapNext assembled this private draft from your saved photos; it does not auto-post.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <button onClick={copyPost} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/12 px-4 text-sm font-bold"><Copy className="h-4 w-4" />Copy</button>
          <button onClick={exportCollage} disabled={!!busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/12 px-4 text-sm font-bold disabled:opacity-50">{busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export</button>
          <button onClick={shareStory} disabled={!!busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black disabled:opacity-50">{busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Share</button>
        </div>
      </section>
    </div>
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/42">The collage is rendered on your device when you export or share it. SnapNext stores only the private story manifest and references to your existing photos, so this feature does not create another full-resolution copy in cloud storage.</div>
  </div>;
}
