export const dynamic = 'force-dynamic';

export async function GET() {
  const names = [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'NEXT_PUBLIC_GEMINI_API_KEY',
  ];

  const checks = Object.fromEntries(
    names.map((name) => {
      const value = process.env[name];
      return [
        name,
        {
          exists: Boolean(value),
          length: value ? value.length : 0,
          prefix: value ? `${value.slice(0, 2)}***` : null,
        },
      ];
    })
  );

  return Response.json({
    ok: true,
    environment: process.env.VERCEL_ENV || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    deployment: process.env.VERCEL_URL || 'unknown',
    checks,
  });
}
