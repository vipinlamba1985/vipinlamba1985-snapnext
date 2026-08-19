import { getDb } from '../lib/db.js';
import { runMagicCoverageQuery } from '../lib/magic-manifest.server.js';

async function main() {
  const db = await getDb();
  const result = await runMagicCoverageQuery(db);
  const overall = result?.overall?.[0] || {
    total: 0,
    trustworthyCapture: 0,
    captureCoveragePct: 0,
    deterministicScreenshotMatches: 0,
  };

  console.log(JSON.stringify({
    blueprintVersion: 'magic-v1',
    measuredAt: new Date().toISOString(),
    overall,
    perUser: result?.perUser || [],
    decisionInputs: {
      configuredMinMagicCards: Number(process.env.MIN_MAGIC_CARDS || 3),
      note: 'Use this result to validate MIN_MAGIC_CARDS and deterministic screenshot recall before production rollout.',
    },
  }, null, 2));
}

main().catch(error => {
  console.error('[magic-library-coverage] failed:', error?.message || error);
  process.exitCode = 1;
});
