import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

const TEMPLATES = [
  { id: 'animated-avatar', category: 'avatar', name: 'Animated Avatar', description: 'Turn a portrait into a polished animated profile picture.', credits: 25, output: 'image' },
  { id: 'cartoon-profile', category: 'avatar', name: 'Cartoon Profile', description: 'Create a bright illustrated profile portrait.', credits: 20, output: 'image' },
  { id: 'funny-face', category: 'fun', name: 'Funny Face', description: 'Add playful expressions and character styling.', credits: 15, output: 'image' },
  { id: 'dream-background', category: 'background', name: 'Dream Background', description: 'Place the subject in a ready-made cinematic or fantasy scene.', credits: 20, output: 'image' },
  { id: 'photo-motion', category: 'motion', name: 'Bring Photo to Life', description: 'Create a subtle moving-photo clip with natural camera motion.', credits: 60, output: 'video' },
  { id: 'portrait-wave', category: 'motion', name: 'Wave & Smile', description: 'Animate a portrait with a gentle smile and wave.', credits: 75, output: 'video' },
];

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function clean(value, max = 500) { return String(value || '').trim().slice(0, max); }

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({
    templates: TEMPLATES,
    providerReady: !!process.env.AVATAR_MOTION_PROVIDER_URL,
    privacy: 'Your selected photo is used only for the requested creation. SnapNext never publishes or shares the result automatically.',
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const template = TEMPLATES.find((item) => item.id === body.templateId);
  if (!template) return json({ error: 'Choose a valid creation style.' }, 400);
  const mediaId = clean(body.mediaId, 100);
  if (!mediaId) return json({ error: 'Choose a portrait or photo first.' }, 400);

  const db = await getDb();
  const media = await db.collection('media').findOne({ userId: user.id, id: mediaId, kind: 'photo', trashed: { $ne: true } });
  if (!media) return json({ error: 'Selected photo was not found.' }, 404);

  const providerUrl = process.env.AVATAR_MOTION_PROVIDER_URL;
  const providerKey = process.env.AVATAR_MOTION_PROVIDER_KEY;
  if (!providerUrl) {
    return json({
      error: 'Avatar and motion generation is being activated. No AI Credits were used.',
      code: 'provider_not_configured',
      coreAvailable: true,
    }, 503);
  }

  const jobId = randomUUID();
  const createdAt = new Date();
  const job = {
    id: jobId, userId: user.id, mediaId, templateId: template.id, templateName: template.name,
    status: 'processing', outputType: template.output, creditsReserved: template.credits,
    prompt: clean(body.prompt, 500), createdAt, updatedAt: createdAt,
  };
  await db.collection('avatar_motion_jobs').insertOne(job);

  try {
    const buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(providerKey ? { Authorization: `Bearer ${providerKey}` } : {}) },
      body: JSON.stringify({
        requestId: jobId,
        mode: template.id,
        outputType: template.output,
        imageBase64: buffer.toString('base64'),
        mimeType: media.mime || 'image/jpeg',
        prompt: clean(body.prompt, 500),
      }),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const result = await response.json();
    const outputUrl = clean(result.outputUrl || result.url, 2000);
    if (!outputUrl) throw new Error('Provider returned no output URL');
    await db.collection('avatar_motion_jobs').updateOne({ userId: user.id, id: jobId }, { $set: { status: 'completed', outputUrl, completedAt: new Date(), updatedAt: new Date() } });
    return json({ job: { id: jobId, status: 'completed', outputUrl, outputType: template.output }, creditsUsed: template.credits });
  } catch (error) {
    await db.collection('avatar_motion_jobs').updateOne({ userId: user.id, id: jobId }, { $set: { status: 'failed', failureCode: 'provider_failed', updatedAt: new Date() } });
    return json({ error: 'Creation could not be completed. No AI Credits were charged.', code: 'provider_failed' }, 502);
  }
}
