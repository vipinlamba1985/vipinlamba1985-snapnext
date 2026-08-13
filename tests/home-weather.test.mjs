import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  describeMetSymbol,
  formatWeatherHour,
  normalizeMetForecast,
  weatherUnitsForCountry,
} from '../lib/weather.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

function point(hour, temperature, symbol = 'partlycloudy_day', precipitation = 0, wind = 3.3) {
  return {
    time: `2026-08-13T${String(hour).padStart(2, '0')}:00:00Z`,
    data: {
      instant: { details: { air_temperature: temperature, wind_speed: wind } },
      next_1_hours: {
        summary: { symbol_code: symbol },
        details: { precipitation_amount: precipitation },
      },
    },
  };
}

test('weather units follow the user country without pretending every market uses Celsius', () => {
  assert.equal(weatherUnitsForCountry('CA').temperatureSymbol, '°C');
  assert.equal(weatherUnitsForCountry('CA').windLabel, 'km/h');
  assert.equal(weatherUnitsForCountry('US').temperatureSymbol, '°F');
  assert.equal(weatherUnitsForCountry('US').windLabel, 'mph');
});

test('MET Norway symbols map to compact Home weather states', () => {
  assert.deepEqual(describeMetSymbol('clearsky_night', false), { label: 'Clear night', kind: 'clear' });
  assert.equal(describeMetSymbol('partlycloudy_day').kind, 'partly-cloudy');
  assert.equal(describeMetSymbol('heavyrainandthunder').kind, 'storm');
  assert.equal(describeMetSymbol('snowshowers_day').kind, 'snow');
});

test('weather hour formatting respects the supplied timezone', () => {
  assert.equal(formatWeatherHour('2026-08-13T00:00:00Z', 'UTC'), '12AM');
  assert.equal(formatWeatherHour('2026-08-13T13:00:00Z', 'UTC'), '1PM');
});

test('Home weather normalizes current conditions, next hours and an honest 24-hour range', () => {
  const temperatures = [19, 18, 18, 18, 17, 17, 18, 20, 22, 24, 25, 24, 23, 22, 21, 20, 19, 18, 18, 17, 17, 18, 18, 19];
  const timeseries = temperatures.map((temperature, index) => point(
    index,
    temperature,
    index === 5 ? 'lightrain' : 'partlycloudy_day',
    index === 5 ? 0.8 : 0,
  ));
  const weather = normalizeMetForecast(
    { properties: { timeseries } },
    { city: 'Montreal', country: 'CA', timezone: 'UTC' },
  );

  assert.equal(weather.available, true);
  assert.equal(weather.city, 'Montreal');
  assert.equal(weather.current.temperature, 19);
  assert.equal(weather.current.wind, 12);
  assert.equal(weather.range24h.high, 25);
  assert.equal(weather.range24h.low, 17);
  assert.equal(weather.hourly.length, 6);
  assert.equal(weather.hourly[5].kind, 'rain');
  assert.match(weather.summary, /Wet weather is possible around 5AM/);
  assert.equal(weather.attribution.provider, 'MET Norway');
});

test('weather route uses coarse Vercel IP location through a server-side MET Norway proxy', async () => {
  const route = await read(path.join('app', 'api', 'weather', 'route.js'));
  assert.match(route, /x-vercel-ip-latitude/);
  assert.match(route, /x-vercel-ip-longitude/);
  assert.match(route, /x-vercel-ip-city/);
  assert.match(route, /Math\.round\(latitude \* 100\) \/ 100/);
  assert.match(route, /api\.met\.no\/weatherapi\/locationforecast\/2\.0\/compact/);
  assert.match(route, /User-Agent.*SnapNext\/1\.0/s);
  assert.match(route, /revalidate: 3600/);
  assert.doesNotMatch(route, /open-meteo|navigator\.geolocation|apikey/i);
});

test('Home weather welcome replaces the duplicate header without changing Home navigation', async () => {
  const component = await read(path.join('components', 'home', 'HomeWeatherWelcome.js'));
  const layout = await read(path.join('app', '(app)', 'dashboard', 'layout.js'));
  assert.match(component, /data-testid="home-weather-welcome"/);
  assert.match(component, /Good morning|greeting\(\)/);
  assert.match(component, /range24h/);
  assert.match(component, /home-weather-hourly/);
  assert.match(component, /MET Norway|weather\.attribution/);
  assert.doesNotMatch(component, /navigator\.geolocation/);
  assert.match(layout, /HomeWeatherWelcome/);
  assert.match(layout, /home-personal-header/);
  assert.match(layout, /FamilyWatchLauncher/);
});
