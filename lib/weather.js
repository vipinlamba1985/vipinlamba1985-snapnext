function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function celsiusToFahrenheit(value) {
  return (value * 9) / 5 + 32;
}

function metresPerSecondToWind(value, useImperial) {
  return useImperial ? value * 2.2369362921 : value * 3.6;
}

export function weatherUnitsForCountry(country) {
  const useImperial = String(country || '').trim().toUpperCase() === 'US';
  return {
    useImperial,
    temperatureSymbol: useImperial ? '°F' : '°C',
    windLabel: useImperial ? 'mph' : 'km/h',
  };
}

export function describeMetSymbol(value, isDay = true) {
  const code = String(value || '').toLowerCase();
  if (code.includes('thunder')) return { label: 'Thunderstorms', kind: 'storm' };
  if (code.includes('snow')) return { label: 'Snow', kind: 'snow' };
  if (code.includes('sleet')) return { label: 'Wintry mix', kind: 'rain' };
  if (code.includes('rain')) return { label: code.includes('light') ? 'Light rain' : 'Rain', kind: 'rain' };
  if (code.includes('fog')) return { label: 'Foggy', kind: 'fog' };
  if (code.includes('partlycloudy')) return { label: 'Partly cloudy', kind: 'partly-cloudy' };
  if (code.includes('cloudy')) return { label: 'Mostly cloudy', kind: 'cloudy' };
  if (code.includes('fair')) return { label: 'Mostly clear', kind: 'partly-cloudy' };
  if (code.includes('clearsky')) return { label: isDay ? 'Clear' : 'Clear night', kind: 'clear' };
  return { label: 'Changing conditions', kind: 'cloudy' };
}

export function formatWeatherHour(value, timezone = 'UTC') {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      hour12: true,
      timeZone: timezone || 'UTC',
    }).format(new Date(value)).replace(' ', '');
  } catch {
    return '';
  }
}

function convertTemperature(value, useImperial) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return useImperial ? celsiusToFahrenheit(number) : number;
}

function localDateKey(value, timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone || 'UTC',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function localHour(value, timezone) {
  try {
    return Number(new Intl.DateTimeFormat('en', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone || 'UTC',
    }).format(new Date(value)));
  } catch {
    return null;
  }
}

function dayPartForHour(hour) {
  if (!Number.isFinite(hour)) return 'today';
  if (hour < 12) return 'this morning';
  if (hour < 17) return 'this afternoon';
  if (hour < 22) return 'this evening';
  return 'tonight';
}

function forecastSymbol(item) {
  return item?.data?.next_1_hours?.summary?.symbol_code
    || item?.data?.next_6_hours?.summary?.symbol_code
    || '';
}

function dominantCondition(items) {
  const counts = new Map();
  for (const item of items) {
    const symbol = forecastSymbol(item);
    const condition = describeMetSymbol(symbol, !String(symbol).includes('_night'));
    const current = counts.get(condition.kind) || { ...condition, count: 0 };
    current.count += 1;
    counts.set(condition.kind, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0] || { label: 'Changing conditions', kind: 'cloudy' };
}

function buildDailyBrief({ items, timezone, high, low, windMax, windUnit }) {
  const dominant = dominantCondition(items);
  const wet = items.filter(item => {
    const symbol = forecastSymbol(item);
    const condition = describeMetSymbol(symbol, !String(symbol).includes('_night'));
    const precipitation = numberOrNull(item?.data?.next_1_hours?.details?.precipitation_amount) ?? 0;
    return precipitation > 0.1 || condition.kind === 'rain' || condition.kind === 'storm' || condition.kind === 'snow';
  });
  const totalPrecipitation = items.reduce((sum, item) => (
    sum + (numberOrNull(item?.data?.next_1_hours?.details?.precipitation_amount) ?? 0)
  ), 0);

  const parts = [`${dominant.label}.`];
  if (high !== null && low !== null) parts.push(`High ${high}°, low ${low}°.`);

  if (wet.length) {
    const periods = [...new Set(wet.map(item => dayPartForHour(localHour(item?.time, timezone))))];
    const hasStorm = wet.some(item => describeMetSymbol(forecastSymbol(item), true).kind === 'storm');
    const hasSnow = wet.some(item => describeMetSymbol(forecastSymbol(item), true).kind === 'snow');
    const event = hasStorm ? 'Thunderstorms' : hasSnow ? 'Snow' : 'Rain';
    const timing = periods.length === 1 ? periods[0] : 'at times today';
    parts.push(`${event} possible ${timing}.`);
  } else {
    parts.push('Dry for most of the day.');
  }

  if (windMax !== null) parts.push(`Winds up to ${windMax} ${windUnit}.`);

  return {
    text: parts.join(' '),
    condition: dominant.label,
    kind: dominant.kind,
    precipitationTotal: Math.round(totalPrecipitation * 10) / 10,
    windMax,
  };
}

export function normalizeMetForecast(payload, context = {}) {
  const timeseries = Array.isArray(payload?.properties?.timeseries) ? payload.properties.timeseries : [];
  if (!timeseries.length) return null;

  const timezone = String(context.timezone || 'UTC');
  const units = weatherUnitsForCountry(context.country);
  const now = timeseries[0];
  const currentDetails = now?.data?.instant?.details || {};
  const currentTemperature = convertTemperature(currentDetails.air_temperature, units.useImperial);
  const currentWind = numberOrNull(currentDetails.wind_speed);
  if (currentTemperature === null) return null;

  const currentSymbol = forecastSymbol(now);
  const currentCondition = describeMetSymbol(currentSymbol, !String(currentSymbol).includes('_night'));

  const next24 = timeseries.slice(0, 24);
  const next24HourPoints = next24
    .map(item => convertTemperature(item?.data?.instant?.details?.air_temperature, units.useImperial))
    .filter(value => value !== null);

  const todayKey = localDateKey(now?.time, timezone);
  const todayItems = timeseries.filter(item => localDateKey(item?.time, timezone) === todayKey);
  const briefItems = todayItems.length ? todayItems : next24;
  const todayTemperatures = briefItems
    .map(item => convertTemperature(item?.data?.instant?.details?.air_temperature, units.useImperial))
    .filter(value => value !== null);
  const todayWindSpeeds = briefItems
    .map(item => numberOrNull(item?.data?.instant?.details?.wind_speed))
    .filter(value => value !== null)
    .map(value => metresPerSecondToWind(value, units.useImperial));

  const dayHigh = todayTemperatures.length ? Math.round(Math.max(...todayTemperatures)) : null;
  const dayLow = todayTemperatures.length ? Math.round(Math.min(...todayTemperatures)) : null;
  const dayWindMax = todayWindSpeeds.length ? Math.round(Math.max(...todayWindSpeeds)) : null;
  const dailyBrief = buildDailyBrief({
    items: briefItems,
    timezone,
    high: dayHigh,
    low: dayLow,
    windMax: dayWindMax,
    windUnit: units.windLabel,
  });

  const wind = currentWind === null ? null : metresPerSecondToWind(currentWind, units.useImperial);

  return {
    available: true,
    city: String(context.city || '').trim() || 'Local weather',
    timezone,
    temperatureUnit: units.temperatureSymbol,
    windUnit: units.windLabel,
    current: {
      temperature: Math.round(currentTemperature),
      condition: currentCondition.label,
      kind: currentCondition.kind,
      wind: wind === null ? null : Math.round(wind),
    },
    today: {
      high: dayHigh,
      low: dayLow,
    },
    range24h: {
      high: next24HourPoints.length ? Math.round(Math.max(...next24HourPoints)) : null,
      low: next24HourPoints.length ? Math.round(Math.min(...next24HourPoints)) : null,
    },
    dailyBrief,
    summary: dailyBrief.text,
    attribution: {
      provider: 'MET Norway',
      providerUrl: 'https://api.met.no/',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  };
}
