import { NextResponse } from 'next/server';
import { normalizeWeatherForecast, weatherUnitsForCountry } from '@/lib/weather';

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
  const timezone = decodeLocationHeader(request.headers.get('x-vercel-ip-timezone')) || 'auto';
  const units = weatherUnitsForCountry(country);

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day,wind_gusts_10m');
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code');
  url.searchParams.set('forecast_hours', '8');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', timezone);
  url.searchParams.set('temperature_unit', units.temperature);
  url.searchParams.set('wind_speed_unit', units.windSpeed);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return unavailable('provider-unavailable');

    const payload = await response.json();
    const weather = normalizeWeatherForecast(payload, {
      city,
      timezone,
      temperatureSymbol: units.temperatureSymbol,
      windLabel: units.windLabel,
    });
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
