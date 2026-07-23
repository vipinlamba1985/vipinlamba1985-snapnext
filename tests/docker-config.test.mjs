import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Docker image uses the Next.js standalone production output', async () => {
  const dockerfile = await text('Dockerfile');
  const nextConfig = await text('next.config.js');

  assert.match(nextConfig, /output:\s*['"]standalone['"]/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.match(dockerfile, /USER nextjs/);
  assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
});

test('Docker image keeps private credentials out of build arguments', async () => {
  const dockerfile = await text('Dockerfile');
  const privateNames = [
    'MONGODB_URI',
    'SUPABASE_SERVICE_ROLE_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'STRIPE_SECRET_KEY',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'CLOUD_CONNECTOR_SECRET',
    'CRON_SECRET',
  ];

  for (const name of privateNames) {
    assert.doesNotMatch(dockerfile, new RegExp(`ARG\\s+${name}\\b`));
  }
});

test('Docker runtime exposes health checks and persistent local uploads', async () => {
  const [dockerfile, compose, health] = await Promise.all([
    text('Dockerfile'),
    text('docker-compose.yml'),
    text('app/api/health/route.js'),
  ]);

  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/api\/health/);
  assert.match(compose, /snapnext_uploads:\/app\/uploads/);
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(health, /status:\s*['"]ok['"]/);
});

test('Docker ignore rules exclude secrets and generated data', async () => {
  const dockerignore = await text('.dockerignore');

  assert.match(dockerignore, /^\.env\.\*$/m);
  assert.match(dockerignore, /^uploads$/m);
  assert.match(dockerignore, /^node_modules$/m);
  assert.match(dockerignore, /^\.next$/m);
});
