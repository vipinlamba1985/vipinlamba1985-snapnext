import { getSessionAccount } from '@/lib/auth/api-service';
import { authError, authJson } from '@/lib/auth/route-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    return authJson(await getSessionAccount(request));
  } catch (error) {
    return authError(error);
  }
}
