import { NextResponse } from 'next/server';
import { trashRetentionDays } from '@/lib/trash-purge';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ retentionDays: trashRetentionDays() });
}
