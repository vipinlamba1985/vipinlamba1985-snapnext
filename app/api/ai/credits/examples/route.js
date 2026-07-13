import { AI_CREDIT_EXAMPLES } from '@/lib/ai-credits';

export async function GET() {
  return Response.json({ examples: AI_CREDIT_EXAMPLES });
}
