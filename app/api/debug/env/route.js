import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    nodeEnv: process.env.NODE_ENV || null,
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelProjectProductionUrl: Boolean(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  });
}
