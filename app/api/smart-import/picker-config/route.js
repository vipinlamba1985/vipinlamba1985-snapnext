import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.json({
    dropbox: {
      configured: Boolean(process.env.DROPBOX_CLIENT_ID),
      appKey: process.env.DROPBOX_CLIENT_ID || null,
      mode: 'hosted_chooser',
    },
    onedrive: {
      configured: Boolean(process.env.ONEDRIVE_CLIENT_ID),
      clientId: process.env.ONEDRIVE_CLIENT_ID || null,
      redirectUri: `${appUrl}/onedrive-picker-redirect`,
      mode: 'hosted_picker',
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
