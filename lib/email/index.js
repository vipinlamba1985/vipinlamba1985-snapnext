import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { TEMPLATE_REGISTRY } from './templates';
import { signUnsubToken } from './tokens';

const PROVIDER = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
const FROM_ADDR = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'SnapNext AI';
const FROM = /</.test(FROM_ADDR) ? FROM_ADDR : `${FROM_NAME} <${FROM_ADDR}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------- providers ----------

async function sendWithResend({ to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html, text, reply_to: replyTo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `Resend error ${res.status}`;
    throw new Error(msg);
  }
  return { providerId: data?.id || data?.message_id || null, provider: 'resend' };
}

async function sendWithMock({ to, subject, html, text }) {
  console.log('\n[email:mock] ----------');
  console.log(`[email:mock] To: ${to}`);
  console.log(`[email:mock] Subject: ${subject}`);
  if (text) console.log(`[email:mock] Text: ${text.slice(0, 240)}`);
  console.log('[email:mock] ----------\n');
  return { providerId: `mock_${Date.now()}`, provider: 'mock' };
}

// ---------- abstraction ----------

function shouldSend({ template, prefs }) {
  const def = TEMPLATE_REGISTRY[template];
  if (!def) return { ok: false, reason: 'unknown_template' };
  if (def.transactional) return { ok: true };
  // Marketing/non-transactional respect prefs (default true if undefined).
  const key = def.prefKey;
  if (!key) return { ok: true };
  const enabled = prefs?.[key];
  if (enabled === false) return { ok: false, reason: 'unsubscribed' };
  return { ok: true };
}

export async function sendEmail({ template, to, data = {}, userId = null, prefs = null, meta = {} }) {
  const def = TEMPLATE_REGISTRY[template];
  if (!def) throw new Error(`Unknown email template: ${template}`);
  const gate = shouldSend({ template, prefs });
  if (!gate.ok) {
    await logEvent({ userId, to, template, status: 'skipped', provider: PROVIDER, error: gate.reason, meta });
    return { skipped: true, reason: gate.reason };
  }

  // Inject unsubscribe URL for non-transactional templates.
  let unsubscribeUrl = null;
  if (!def.transactional && userId) {
    const tok = signUnsubToken({ uid: userId, k: def.prefKey });
    unsubscribeUrl = `${APP_URL}/unsubscribe?t=${tok}`;
  }
  const rendered = def.fn({ ...data, appUrl: APP_URL, supportEmail: process.env.SUPPORT_EMAIL, unsubscribeUrl });

  let result;
  try {
    if (PROVIDER === 'resend' && process.env.RESEND_API_KEY) {
      result = await sendWithResend({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, replyTo: process.env.SUPPORT_EMAIL });
    } else {
      result = await sendWithMock({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    }
    await logEvent({ userId, to, template, status: 'sent', provider: result.provider, providerId: result.providerId, meta });
    return { ok: true, providerId: result.providerId, provider: result.provider };
  } catch (e) {
    await logEvent({ userId, to, template, status: 'failed', provider: PROVIDER, error: e?.message || String(e), meta });
    if (IS_PROD) return { ok: false, error: 'send_failed' };
    return { ok: false, error: e?.message || 'send_failed' };
  }
}

export async function logEvent({ userId = null, to, template, status, provider, providerId = null, error = null, meta = {} }) {
  try {
    const db = await getDb();
    await db.collection('email_events').insertOne({
      id: uuidv4(), userId, to, template, status, provider, providerId, error,
      meta, sentAt: new Date(), updatedAt: new Date(),
    });
  } catch (e) { console.error('[email] log failed', e?.message); }
}

// Helpers used by the webhook to update status by providerId.
export async function recordWebhookEvent({ providerId, status, raw }) {
  try {
    const db = await getDb();
    if (providerId) {
      await db.collection('email_events').updateOne(
        { providerId },
        { $set: { status, updatedAt: new Date() }, $push: { webhookHistory: { status, at: new Date() } } },
      );
    }
    await db.collection('email_events_raw').insertOne({ id: uuidv4(), providerId, status, raw, receivedAt: new Date() });
  } catch (e) { console.error('[email] webhook log failed', e?.message); }
}

export function isProvider(name) { return PROVIDER === name; }
export function hasRealProvider() { return PROVIDER === 'resend' && !!process.env.RESEND_API_KEY; }
export function isProduction() { return IS_PROD; }
