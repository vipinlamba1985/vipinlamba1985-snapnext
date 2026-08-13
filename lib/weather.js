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

function convertTemperature(value, useImperial) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return useImperial ? celsiusToFahrenheit(number) : number;
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

  const currentSymbol = now?.data?.next_1_hours?.summary?.symbol_code
    || now?.data?.next_6_hours?.summary?.symbol_code
    || '';
  const currentCondition = describeMetSymbol(currentSymbol, !String(currentSymbol).includes('_night'));
  const todayKey = localDateKey(now.time, timezone);

  const nextDayPoints = timeseries
    .filter(item => localDateKey(item?.time, timezone) === todayKey)
    .map(item => convertTemperature(item?.data?.instant?.details?.air_temperature, units.useImperial))
    .filter(value => value !== null);

  const hourly = timeseries.slice(0, 6).map(item => {
    const details = item?.data?.instant?.details || {};
    const symbol = item?.data?.next_1_hours?.summary?.symbol_code
      || item?.data?.next_6_hours?.summary?.symbol_code
      || '';
    const condition = describeMetSymbol(symbol, !String(symbol).includes('_night'));
    const precipitation = numberOrNull(item?.data?.next_1_hours?.details?.precipitation_amount)
      ?? numberOrNull(item?.data?.next_6_hours?.details?.precipitation_amount)
      ?? 0;
    return {
      label: formatWeatherHour(item?.time, timezone),
      temperature: convertTemperature(details.air_temperature, units.useImperial),
      precipitationAmount: precipitation,
      condition: condition.label,
      kind: condition.kind,
    };
  }).filter(item => item.temperature !== null && item.label);

  const nextRain = hourly.find(item => item.kind === 'rain' || item.kind === 'storm');
  const wind = currentWind === null ? null : metresPerSecondToWind(currentWind, units.useImperial);

  let summary = 'A quick look at the next few hours.';
  if (nextRain?.label) summary = `Wet weather is possible around ${nextRain.label}.`;
  else if (wind !== null && wind >= (units.useImperial ? 20 : 32)) summary = `Breezy, with winds near ${Math.round(wind)} ${units.windLabel}.`;

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
      high: nextDayPoints.length ? Math.round(Math.max(...nextDayPoints)) : null,
      low: nextDayPoints.length ? Math.round(Math.min(...nextDayPoints)) : null,
    },
    hourly: hourly.map(item => ({
      ...item,
      temperature: Math.round(item.temperature),
      precipitationAmount: Math.round(item.precipitationAmount * 10) / 10,
    })),
    summary,
    attribution: {
      provider: 'MET Norway',
      providerUrl: 'https://api.met.no/',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  };
}
