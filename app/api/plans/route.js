import { NextResponse } from 'next/server';
import { publicPlans } from '@/lib/public-plans';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ plans: publicPlans() });
}
