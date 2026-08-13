import { NextResponse } from 'next/server';
import { normalizeMetForecast } from '@/lib/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function decodeLocationHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function unavailable(reason) {
  return NextResponse.json(
    { available: false, reason },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function GET(request) {
  const latitude = validCoordinate(request.headers.get('x-vercel-ip-latitude'), -90, 90);
  const longitude = validCoordinate(request.headers.get('x-vercel-ip-longitude'), -180, 180);
  if (latitude === null || longitude === null) return unavailable('location-unavailable');

  const city = decodeLocationHeader(request.headers.get('x-vercel-ip-city'));
  const country = String(request.headers.get('x-vercel-ip-country') || '').toUpperCase();
  const timezone = decodeLocationHeader(request.headers.get('x-vercel-ip-timezone')) || 'UTC';

  // Vercel's IP-derived coordinates are approximate already. Rounding them further
  // keeps the weather request coarse, improves cache reuse, and avoids pretending
  // that the Home card knows a user's precise location.
  const lat = Math.round(latitude * 100) / 100;
  const lon = Math.round(longitude * 100) / 100;
  const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
  url.searchParams.set('lat', lat.toFixed(2));
  url.searchParams.set('lon', lon.toFixed(2));

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SnapNext/1.0 (+https://snapnext.ai)',
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return unavailable('provider-unavailable');

    const payload = await response.json();
    const weather = normalizeMetForecast(payload, { city, country, timezone });
    if (!weather) return unavailable('forecast-unavailable');

    return NextResponse.json(
      { ...weather, locationAccuracy: 'approximate' },
      { headers: { 'Cache-Control': 'private, max-age=600' } },
    );
  } catch (error) {
    console.warn('[weather] forecast unavailable', error?.message || error);
    return unavailable('provider-unavailable');
  }
}
