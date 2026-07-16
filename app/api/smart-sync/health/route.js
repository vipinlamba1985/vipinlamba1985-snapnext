import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { listProviderStatus } from '@/lib/smart-sync/providers';
import { listOAuthAdapterStatus } from '@/lib/smart-sync/oauth-adapters';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  return NextResponse.json({
    ready: true,
    providers: listProviderStatus(),
    oauth: listOAuthAdapterStatus(),
    native: {
      ios: { codeReady: true, permissionModel: 'photo_library', backgroundUpload: true },
      android: { codeReady: true, permissionModel: 'media_library', backgroundUpload: true },
    },
  });
}
