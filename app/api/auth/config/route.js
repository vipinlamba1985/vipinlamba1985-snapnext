import { getAuthConfig } from '@/lib/auth/api-service';
import { authJson } from '@/lib/auth/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return authJson(getAuthConfig());
}
