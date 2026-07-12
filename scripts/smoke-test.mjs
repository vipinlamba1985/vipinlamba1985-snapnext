import process from 'node:process';

const baseUrl = (process.env.SNAPNEXT_BASE_URL || 'https://snapnext.ai').replace(/\/$/, '');
const failures = [];

function pass(name) { console.log(`✓ ${name}`); }
function fail(name, details) { failures.push(`${name}: ${details}`); console.error(`✗ ${name} — ${details}`); }
function expect(condition, message) { if (!condition) throw new Error(message); }

async function check(name, run) {
  try { await run(); pass(name); }
  catch (error) { fail(name, error instanceof Error ? error.message : String(error)); }
}

await check('Home page is reachable', async () => {
  const response = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  expect(response.status >= 200 && response.status < 400, `received HTTP ${response.status}`);
});

await check('Login page is reachable', async () => {
  const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
  expect(response.status >= 200 && response.status < 400, `received HTTP ${response.status}`);
});

for (const path of ['/dashboard', '/upload', '/billing']) {
  await check(`Unauthenticated ${path} redirects to login`, async () => {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    expect([301, 302, 303, 307, 308].includes(response.status), `received HTTP ${response.status}`);
    const location = response.headers.get('location') || '';
    expect(location.includes('/login'), `redirect location was ${location || 'missing'}`);
  });
}

await check('Security headers are present', async () => {
  const response = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  for (const header of ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'referrer-policy']) {
    expect(Boolean(response.headers.get(header)), `${header} is missing`);
  }
  const frameOptions = response.headers.get('x-frame-options');
  expect(frameOptions === 'DENY', `x-frame-options was ${frameOptions || 'missing'}`);
});

await check('Unknown browser origin is rejected', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'GET',
    redirect: 'manual',
    headers: { Origin: 'https://example.com' },
  });
  expect(response.status === 403, `received HTTP ${response.status}`);
});

await check('Oversized API write is rejected early', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
      'Content-Length': String(2 * 1024 * 1024 + 1),
    },
    body: JSON.stringify({ probe: true }),
  });
  expect(response.status === 413, `received HTTP ${response.status}`);
});

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nAll smoke checks passed for ${baseUrl}`);
