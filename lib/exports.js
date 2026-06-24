// ZIP export worker. Runs server-side using `archiver`.
// Streams media files from the storage abstraction (local or S3) into a single ZIP.
// Updates the export_jobs doc with progress + final state, then notifies the user.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { storage } from '@/lib/storage';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/favorites';

const EXPORT_DIR = '/app/uploads/exports';
const RETENTION_DAYS = 7;

export async function runExportJob(jobId) {
  const db = await getDb();
  const job = await db.collection('export_jobs').findOne({ id: jobId });
  if (!job) return;
  await db.collection('export_jobs').updateOne({ id: jobId }, { $set: { status: 'processing', startedAt: new Date(), progress: 0 } });

  try {
    await fsp.mkdir(EXPORT_DIR, { recursive: true });
    const outPath = path.join(EXPORT_DIR, `${jobId}.zip`);
    const out = fs.createWriteStream(outPath);
    const archiver = (await import('archiver')).default;
    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.pipe(out);

    const total = job.mediaIds.length;
    let done = 0;
    for (const mediaId of job.mediaIds) {
      try {
        const m = await db.collection('media').findOne({ id: mediaId, userId: job.userId });
        if (!m) { done++; continue; }
        const buf = await storage.read({ provider: m.provider || 'local', storageKey: m.storageKey });
        const safeName = (m.name || mediaId).replace(/[\\/:*?"<>|]/g, '_');
        zip.append(buf, { name: safeName });
        done++;
        if (done % 5 === 0 || done === total) {
          await db.collection('export_jobs').updateOne({ id: jobId }, { $set: { progress: Math.round((done / Math.max(total, 1)) * 100), processedCount: done } });
        }
      } catch (e) {
        console.error('[export] file failed', mediaId, e?.message);
        done++;
      }
    }
    await zip.finalize();
    await new Promise((resolve) => out.on('close', resolve));
    const stat = await fsp.stat(outPath);

    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.collection('export_jobs').updateOne({ id: jobId }, {
      $set: {
        status: 'ready', progress: 100, processedCount: done,
        completedAt: new Date(), expiresAt, zipPath: outPath, bytes: stat.size,
      },
    });

    // Notify + email.
    const user = await db.collection('users').findOne({ id: job.userId });
    if (user) {
      await notify(db, {
        userId: user.id, type: 'download_ready',
        title: `Your export is ready (${(stat.size / 1024 / 1024).toFixed(1)} MB)`,
        payload: { jobId, count: total },
      });
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
        await sendEmail({
          template: 'download_ready', to: user.email, userId: user.id,
          data: { name: user.name, downloadUrl: `${base}/downloads?job=${jobId}` },
          prefs: user.emailPrefs, meta: { event: 'export_ready', jobId },
        });
      } catch (e) { console.error('[export] email failed', e?.message); }
    }
  } catch (e) {
    console.error('[export] job failed', jobId, e?.message);
    await db.collection('export_jobs').updateOne({ id: jobId }, { $set: { status: 'failed', error: e?.message || 'export_failed', failedAt: new Date() } });
  }
}

/** Lazy cleanup of expired ZIP files; called on list reads. */
export async function cleanupExpiredExports() {
  const db = await getDb();
  const now = new Date();
  const expired = await db.collection('export_jobs').find({ status: 'ready', expiresAt: { $lt: now } }).toArray();
  for (const j of expired) {
    if (j.zipPath) { try { await fsp.unlink(j.zipPath); } catch {} }
    await db.collection('export_jobs').updateOne({ id: j.id }, { $set: { status: 'expired', zipPath: null } });
  }
}

export function createJob({ userId, type, mediaIds, name }) {
  return {
    id: uuidv4(), userId, type, status: 'queued',
    name: name || `SnapNext-${type}-${new Date().toISOString().slice(0,10)}.zip`,
    mediaIds, progress: 0, processedCount: 0, totalCount: mediaIds.length,
    createdAt: new Date(),
  };
}

export { EXPORT_DIR, RETENTION_DAYS };
