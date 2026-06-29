export const dynamic = 'force-dynamic';

export async function GET() {
  const names = [
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'AI_PROVIDER_PRIMARY',
    'AI_PROVIDER_VISION',
    'AI_PROVIDER_FALLBACK',
  ];

  const checks = Object.fromEntries(
    names.map((name) => [name, { configured: Boolean(process.env[name]) }])
  );

  return Response.json({
    ok: true,
    environment: process.env.VERCEL_ENV ? 'vercel' : 'local_or_unknown',
    checks,
  });
}
