'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  ArrowLeft, BookOpen, Copy, Download, Film, Gauge, Hash, ImageIcon, Layers3,
  Loader2, PenLine, Share2, Smile, Sparkles, ThumbsDown, ThumbsUp, Wand2, WandSparkles,
} from 'lucide-react';

const GOALS = [
  { id: 'restore', title: 'Restore a photo', detail: 'Repair an old family photo while keeping the original untouched.', icon: WandSparkles, href: '/ai-studio/restoration' },
  { id: 'caption', title: 'Caption', detail: 'Turn one memory into words that sound like you.', icon: PenLine, mode: 'caption' },
  { id: 'reel', title: 'Reel', detail: 'Build a short video from the moments you choose.', icon: Film, href: '/create/reel' },
  { id: 'story', title: 'Story', detail: 'Start from memories SnapNext has already brought together.', icon: BookOpen, href: '/memories' },
  { id: 'emoji', title: 'Emoji pack', detail: 'Give a thought or caption the right feeling.', icon: Smile, mode: 'emoji' },
  { id: 'timeline', title: 'Timeline', detail: 'Rediscover chapters and turn them into something shareable.', icon: Layers3, href: '/memories' },
  { id: 'export', title: 'Export', detail: 'Take your memories or finished work with you.', icon: Download, href: '/downloads' },
];

export default function AIStudio() {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [goal, setGoal] = useState(null);
  const [topic, setTopic] = useState('');
  const [mood, setMood] = useState('warm');
  const [platform, setPlatform] = useState('instagram');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [emojis, setEmojis] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [busy, setBusy] = useState('');
  const [aiStatus, setAiStatus] = useState(null);
  const [lastAiMeta, setLastAiMeta] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    apiFetch('/ai/status?feature=caption').then(setAiStatus).catch(() => {});
    apiFetch('/media?filter=photo').then(data => setPhotos(data.items?.slice(0, 24) || [])).catch(() => {});
  }, []);

  async function previewTask(kind = 'caption') {
    setBusy('preview');
    try {
      const feature = kind === 'ideas' ? 'postIdeas' : kind === 'all' ? 'doAll' : kind;
      const res = await apiFetch('/ai-os/preview', {
        method: 'POST',
        body: JSON.stringify({
          task: topic || caption || 'Create something from my SnapNext memory',
          feature,
          qualityMode: mood === 'epic' || mood === 'cinematic' ? 'premium' : 'balanced',
          input: { topic, mood, platform, mediaId: selected },
        }),
      });
      setPreview(res);
      toast.success('Preview ready.');
    } catch (e) {
      toast.error(e.message || 'Unable to preview this creation.');
    } finally {
      setBusy('');
    }
  }

  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'caption') {
        const res = await apiFetch('/ai/caption', { method: 'POST', body: JSON.stringify({ topic, mood, platform, mediaId: selected }) });
        setCaption(res.caption || '');
        setLastAiMeta({ agentId: 'creator', feature: 'caption', requestId: res.meta?.requestId || null });
      } else if (kind === 'hashtags') {
        const res = await apiFetch('/ai/hashtags', { method: 'POST', body: JSON.stringify({ text: caption || topic || 'photo memory' }) });
        setHashtags(res.hashtags || '');
        setLastAiMeta({ agentId: 'creator', feature: 'hashtags', requestId: res.meta?.requestId || null });
      } else if (kind === 'emojis') {
        const res = await apiFetch('/ai/emojis', { method: 'POST', body: JSON.stringify({ text: caption || topic || 'photo memory' }) });
        setEmojis(res.emojis || '');
        setLastAiMeta({ agentId: 'creator', feature: 'emojis', requestId: res.meta?.requestId || null });
      } else if (kind === 'ideas') {
        const res = await apiFetch('/ai/post-ideas', { method: 'POST', body: JSON.stringify({ topic: topic || 'recent memories' }) });
        setIdeas(res.ideas || []);
        setLastAiMeta({ agentId: 'creator', feature: 'postIdeas', requestId: res.meta?.requestId || null });
      }
    } catch (e) {
      toast.error(e.message || 'SnapNext could not create that yet.');
    } finally {
      setBusy('');
    }
  }

  function copy(value) {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast.success('Copied');
  }

  async function sendFeedback(rating) {
    try {
      await apiFetch('/ai-os/feedback', {
        method: 'POST',
        body: JSON.stringify({
          agentId: lastAiMeta?.agentId || 'creator',
          feature: lastAiMeta?.feature || 'caption',
          requestId: lastAiMeta?.requestId || null,
          rating,
        }),
      });
      toast.success('Thanks — this helps SnapNext improve.');
    } catch (e) {
      toast.error(e.message || 'Unable to save feedback.');
    }
  }

  const activeGoal = GOALS.find(item => item.mode === goal) || null;
  const hasResult = Boolean(caption || hashtags || emojis || ideas.length);

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-32 md:pb-12">
      <header data-testid="create-header" className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-pink-300/15 bg-pink-500/10 px-3 py-1.5 text-xs font-black text-pink-100"><Sparkles className="h-3.5 w-3.5" />SnapNext Create</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">What would you like to make?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50 md:text-base">Choose a goal. SnapNext handles the prompting and keeps you in control of what gets shared.</p>
        </div>
        {aiStatus && <div data-testid="create-credit-status" className="hidden rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-right text-xs text-white/45 sm:block"><div className="font-bold text-white/70">{aiStatus.plan} plan</div><div className="mt-1">{aiStatus.monthlyCredits} monthly credits</div></div>}
      </header>

      {!goal ? (
        <>
          <section data-testid="create-goal-grid" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {GOALS.map(({ id, title, detail, icon: Icon, href, mode }) => {
              const body = <><div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/22 via-purple-500/18 to-cyan-500/12"><Icon className="h-5 w-5 text-pink-100" /></div><h2 className="mt-5 text-lg font-black">{title}</h2><p className="mt-2 text-sm leading-5 text-white/45">{detail}</p></>;
              return href ? <Link data-testid={`create-goal-${id}`} key={id} href={href} className="min-h-44 rounded-[1.7rem] border border-white/8 bg-white/[0.035] p-4 transition hover:bg-white/[0.055]">{body}</Link> : <button data-testid={`create-goal-${id}`} key={id} onClick={() => setGoal(mode)} className="min-h-44 rounded-[1.7rem] border border-white/8 bg-white/[0.035] p-4 text-left transition hover:bg-white/[0.055]">{body}</button>;
            })}
          </section>

          <section data-testid="create-ready-post" className="flex items-center gap-4 rounded-3xl border border-white/8 bg-white/[0.025] p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-purple-500/15"><Share2 className="h-5 w-5 text-purple-100" /></div>
            <div className="min-w-0 flex-1"><h2 className="font-black">Already know where you want to post?</h2><p className="mt-1 text-sm text-white/45">Prepare a social-ready caption and finishing touches.</p></div>
            <Link data-testid="create-ready-post-link" href="/ready-to-post" className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-black text-black">Ready to post</Link>
          </section>
        </>
      ) : (
        <section data-testid="create-workspace" className="space-y-5">
          <button data-testid="create-back-to-goals" onClick={() => { setGoal(null); setPreview(null); }} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 text-sm font-bold text-white/65"><ArrowLeft className="h-4 w-4" />All creation goals</button>

          <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-5 md:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">{activeGoal?.title || 'Create'}</h2><p className="mt-1 text-sm text-white/45">{activeGoal?.detail}</p></div>{aiStatus && <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/45">{aiStatus.creditsRequired} credit{Number(aiStatus.creditsRequired) === 1 ? '' : 's'} for a caption</span>}</div>

            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold"><ImageIcon className="h-4 w-4 text-pink-200" />Choose a memory <span className="font-normal text-white/35">optional</span></div>
              {photos.length ? <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">{photos.map(photo => <button data-testid={`create-photo-${photo.id}`} key={photo.id} onClick={() => setSelected(selected === photo.id ? null : photo.id)} className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 ${selected === photo.id ? 'border-pink-400' : 'border-transparent'}`}><img src={mediaSrc(photo.id)} alt="" className="h-full w-full object-cover" /></button>)}</div> : <Link href="/upload" className="block rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/45">Add photos to create directly from a memory.</Link>}
            </div>

            <div className="mt-5">
              <label htmlFor="create-context" className="text-sm font-bold">A little context</label>
              <textarea data-testid="create-context-input" id="create-context" value={topic} onChange={e => setTopic(e.target.value)} rows={3} placeholder={goal === 'emoji' ? 'Paste a caption or describe the feeling…' : 'For example: sunset hike with friends…'} className="mt-2 w-full resize-none rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/25 focus:border-pink-400/40" />
            </div>

            {goal === 'caption' && <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-white/50">Feel<select data-testid="create-mood-select" value={mood} onChange={e => setMood(e.target.value)} className="mt-2 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-3 text-sm text-white outline-none">{['warm','funny','cinematic','poetic','minimalist','epic'].map(option => <option key={option} value={option}>{option}</option>)}</select></label><label className="text-xs font-semibold text-white/50">Destination<select data-testid="create-platform-select" value={platform} onChange={e => setPlatform(e.target.value)} className="mt-2 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-3 text-sm text-white outline-none">{['instagram','tiktok','x','facebook','snapchat'].map(option => <option key={option} value={option}>{option}</option>)}</select></label></div>}

            <div className="mt-5 flex flex-wrap gap-2">
              {goal === 'caption' ? <><ActionButton testId="create-caption-generate" onClick={() => run('caption')} busy={busy === 'caption'} icon={Sparkles} primary>Create caption</ActionButton><ActionButton testId="create-caption-preview" onClick={() => previewTask('caption')} busy={busy === 'preview'} icon={Gauge}>Preview use</ActionButton><ActionButton testId="create-idea-generate" onClick={() => run('ideas')} busy={busy === 'ideas'} icon={Wand2}>Need an idea?</ActionButton></> : <ActionButton testId="create-emoji-generate" onClick={() => run('emojis')} busy={busy === 'emojis'} icon={Smile} primary>Create emoji pack</ActionButton>}
            </div>
          </div>

          {preview && <div data-testid="create-preview" className="rounded-3xl border border-pink-300/15 bg-pink-500/[0.07] p-4"><h3 className="font-black">Before you create</h3><p className="mt-2 text-sm leading-5 text-white/50">{preview.userMessage || 'SnapNext checked the best available creation path.'}</p>{preview.economy?.requiredCredits != null && <p className="mt-2 text-xs text-white/40">This uses {preview.economy.requiredCredits} credit{preview.economy.requiredCredits === 1 ? '' : 's'}.</p>}{!preview.economy?.allowed && <Link href="/billing" className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black">View plan options</Link>}</div>}

          {caption && <ResultCard testId="create-caption-result" label="Caption" value={caption} onCopy={() => copy(caption)}><button data-testid="create-hashtags-generate" onClick={() => run('hashtags')} disabled={busy === 'hashtags'} className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs font-bold disabled:opacity-50">{busy === 'hashtags' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hash className="h-3.5 w-3.5" />}Add hashtags</button><button data-testid="create-caption-emojis" onClick={() => run('emojis')} disabled={busy === 'emojis'} className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs font-bold disabled:opacity-50">{busy === 'emojis' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smile className="h-3.5 w-3.5" />}Add emojis</button></ResultCard>}
          {hashtags && <ResultCard testId="create-hashtag-result" label="Hashtags" value={hashtags} onCopy={() => copy(hashtags)} />}
          {emojis && <ResultCard testId="create-emoji-result" label="Emoji pack" value={emojis} onCopy={() => copy(emojis)} large />}
          {ideas.length > 0 && <div data-testid="create-ideas-result" className="rounded-3xl border border-white/8 bg-white/[0.03] p-5"><h3 className="font-black">Ideas to start from</h3><div className="mt-3 space-y-2">{ideas.map((idea, index) => <button key={`${idea}-${index}`} onClick={() => setTopic(idea)} className="flex w-full items-start gap-3 rounded-2xl bg-white/[0.035] p-3 text-left text-sm"><span className="text-pink-200">{index + 1}</span><span className="flex-1">{idea}</span></button>)}</div></div>}

          {hasResult && <div data-testid="create-feedback" className="flex items-center gap-2 text-xs text-white/40"><span>Did this feel right?</span><button onClick={() => sendFeedback('accepted')} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-2"><ThumbsUp className="h-3.5 w-3.5" />Yes</button><button onClick={() => sendFeedback('rejected')} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-2"><ThumbsDown className="h-3.5 w-3.5" />Needs work</button></div>}
        </section>
      )}
    </div>
  );
}

function ActionButton({ testId, children, onClick, busy, icon: Icon, primary = false }) {
  return <button data-testid={testId} onClick={onClick} disabled={busy} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-black disabled:opacity-50 ${primary ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'border border-white/8 bg-white/5 text-white/70'}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{children}</button>;
}

function ResultCard({ testId, label, value, onCopy, large = false, children }) {
  return <div data-testid={testId} className="rounded-3xl border border-white/8 bg-white/[0.03] p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-black">{label}</h3><button onClick={onCopy} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-2 text-xs font-bold text-white/60"><Copy className="h-3.5 w-3.5" />Copy</button></div><div className={`mt-3 whitespace-pre-wrap leading-6 ${large ? 'text-2xl' : 'text-sm'}`}>{value}</div>{children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}</div>;
}