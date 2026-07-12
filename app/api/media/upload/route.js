export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import crypto from 'crypto';
import { after } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { effectivePlan } from '@/lib/entitlements';
import { storage } from '@/lib/storage';
import { analyzeMediaOnce } from '@/lib/cached-media-analysis';

async function getStorageUsage(db, userId) {
  const rows = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]).toArray();
  return rows[0]?.total || 0;
}

function clean(doc) {
  const { _id, ...rest } = doc;
  return rest;
}

async function enrichSavedMedia({ db, user, jobs }) {
  for (const job of jobs) {
    try {
      const buffer = await storage.read({ provider: job.provider, storageKey: job.storageKey });
      const budgeted = await analyzeMediaOnce({
        db,
        user,
        request: null,
        buffer,
        name: job.name,
        mimeType: job.mime,
        kind: job.kind,
        source: 'upload-background',
      });

      if (budgeted.ok) {
        await db.collection('media').updateOne(
          { id: job.id, userId: user.id },
          {
            $set: {
              aiAnalysis: budgeted.result,
              aiAnalysisCached: Boolean(budgeted.cached),
              aiAnalysisStatus: budgeted.cached ? 'completed_cached' : 'completed',
              aiAnalysisCompletedAt: new Date(),
            },
          },
        );
      } else {
        await db.collection('media').updateOne(
          { id: job.id, userId: user.id },
          {
            $set: {
              aiAnalysisStatus: budgeted.error?.code || 'budget_blocked',
              aiAnalysisCompletedAt: new Date(),
            },
          },
        );
      }
    } catch (error) {
      console.error('[upload-background] AI enrichment failed:', error?.message);
      await db.collection('media').updateOne(
        { id: job.id, userId: user.id },
        {
          $set: {
            aiAnalysisStatus: error?.code || 'analysis_failed',
            aiAnalysisCompletedAt: new Date(),
          },
        },
      ).catch(() => {});
    }
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const plan = effectivePlan(user, request);
  const usedBytes = await getStorageUsage(db, user.id);
  let remaining = plan.id === 'super_user' ? Number.MAX_SAFE_INTEGER : Math.max(0, plan.storageBytes - usedBytes);
  const singleUploadLimit = Math.min(storage.config.maxUploadBytes || Number.MAX_SAFE_INTEGER, plan.maxUploadBytes || Number.MAX_SAFE_INTEGER);

  const formData = await request.formData();
  const files = formData.getAll('files');
  if (!files.length) return Response.json({ error: 'No files' }, { status: 400 });

  const saved = [];
  const skipped = [];
  const enrichmentJobs = [];

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const size = buffer.length;
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const duplicate = await db.collection('media').findOne({ userId: user.id, hash });
      if (duplicate) {
        skipped.push({ name: file.name, reason: 'duplicate', message: 'This file is already safely stored.', retryable: false });
        continue;
      }

      if (plan.id !== 'super_user' && size > remaining) {
        skipped.push({ name: file.name, reason: 'storage_full', message: 'Storage quota exceeded.', retryable: false });
        continue;
      }
      if (size > singleUploadLimit) {
        skipped.push({ name: file.name, reason: 'too_large', message: 'File exceeds the single-upload limit.', retryable: false });
        continue;
      }

      const id = uuidv4();
      const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
      const isVideo = (file.type || '').startsWith('video/') || ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'].includes(ext);
      const stored = await storage.save({
        userId: user.id,
        fileId: id,
        buffer,
        ext,
        name: file.name,
        mime: file.type,
      });

      const doc = {
        id,
        userId: user.id,
        name: file.name,
        size,
        hash,
        mime: file.type || '',
        kind: isVideo ? 'video' : 'photo',
        storageKey: stored.storageKey,
        provider: stored.provider,
        favorite: false,
        trashed: false,
        aiAnalysis: null,
        aiAnalysisStatus: 'pending',
        aiAnalysisCached: false,
        aiAnalysisQueuedAt: new Date(),
        createdAt: new Date(),
      };
      await db.collection('media').insertOne(doc);
      saved.push(clean(doc));
      enrichmentJobs.push({
        id,
        name: file.name,
        mime: file.type || '',
        kind: isVideo ? 'video' : 'photo',
        storageKey: stored.storageKey,
        provider: stored.provider,
      });
      remaining -= size;
    } catch (error) {
      console.error('[upload] failed:', error?.message);
      skipped.push({ name: file?.name || 'unknown', reason: 'error', message: 'Could not save this file.', retryable: true });
    }
  }

  if (enrichmentJobs.length) {
    after(() => enrichSavedMedia({ db, user, jobs: enrichmentJobs }));
  }

  return Response.json({ saved, skipped, savedCount: saved.length, skippedCount: skipped.length });
}
