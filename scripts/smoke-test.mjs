import process from 'node:process';

const baseUrl = (process.env.SNAPNEXT_BASE_URL || 'https://snapnext.ai').replace(/\/$/, '');
const failures = [];
const mobileAgents = {
  'iPhone Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Android Chrome': 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
};

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

for (const [device, userAgent] of Object.entries(mobileAgents)) {
  await check(`${device} receives mobile-ready login HTML`, async () => {
    const response = await fetch(`${baseUrl}/login`, { headers: { 'User-Agent': userAgent } });
    expect(response.ok, `received HTTP ${response.status}`);
    const html = await response.text();
    expect(/name=["']viewport["']/i.test(html), 'viewport metadata is missing');
    expect(/width=device-width/i.test(html), 'device-width viewport is missing');
    expect(!/Application error|Internal Server Error/i.test(html), 'rendered an application error');
  });

  await check(`${device} protected upload route redirects safely`, async () => {
    const response = await fetch(`${baseUrl}/upload`, { redirect: 'manual', headers: { 'User-Agent': userAgent } });
    expect([301, 302, 303, 307, 308].includes(response.status), `received HTTP ${response.status}`);
    expect((response.headers.get('location') || '').includes('/login'), 'did not redirect to login');
  });
}

await check('PWA manifest is reachable and valid', async () => {
  const response = await fetch(`${baseUrl}/manifest.json`);
  expect(response.ok, `received HTTP ${response.status}`);
  const manifest = await response.json();
  expect(Boolean(manifest.name || manifest.short_name), 'manifest name is missing');
  expect(Boolean(manifest.start_url), 'manifest start_url is missing');
  expect(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest icons are missing');
  expect(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display), `unexpected display mode ${manifest.display}`);
});

await check('Service worker is reachable', async () => {
  const response = await fetch(`${baseUrl}/sw.js`);
  expect(response.ok, `received HTTP ${response.status}`);
  const body = await response.text();
  expect(body.length > 20, 'service worker is empty');
});

await check('Legal launch pages are reachable', async () => {
  for (const path of ['/privacy', '/terms', '/ai-policy', '/family-safety']) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    expect(response.status >= 200 && response.status < 400, `${path} returned HTTP ${response.status}`);
  }
});

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
  const body = JSON.stringify({ probe: 'x'.repeat(2 * 1024 * 1024) });
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
    },
    body,
  });
  expect(response.status === 413, `received HTTP ${response.status}`);
});

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nAll launch and mobile smoke checks passed for ${baseUrl}`);
