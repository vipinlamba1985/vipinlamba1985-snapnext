function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function weatherUnitsForCountry(country) {
  const code = String(country || '').trim().toUpperCase();
  if (code === 'US') {
    return {
      temperature: 'fahrenheit',
      temperatureSymbol: '°F',
      windSpeed: 'mph',
      windLabel: 'mph',
    };
  }
  return {
    temperature: 'celsius',
    temperatureSymbol: '°C',
    windSpeed: 'kmh',
    windLabel: 'km/h',
  };
}

export function describeWeatherCode(value, isDay = true) {
  const code = Number(value);
  if (code === 0) return { label: isDay ? 'Clear' : 'Clear night', kind: 'clear' };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', kind: 'partly-cloudy' };
  if (code === 3) return { label: 'Mostly cloudy', kind: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Foggy', kind: 'fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', kind: 'rain' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain', kind: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snow', kind: 'snow' };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorms', kind: 'storm' };
  return { label: 'Changing conditions', kind: 'cloudy' };
}

export function formatWeatherHour(value) {
  const match = String(value || '').match(/T(\d{2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  if (!Number.isFinite(hour)) return '';
  if (hour === 0) return '12AM';
  if (hour < 12) return `${hour}AM`;
  if (hour === 12) return '12PM';
  return `${hour - 12}PM`;
}

export function normalizeWeatherForecast(payload, context = {}) {
  const current = payload?.current || {};
  const currentTemperature = numberOrNull(current.temperature_2m);
  const weatherCode = numberOrNull(current.weather_code);
  if (currentTemperature === null || weatherCode === null) return null;

  const isDay = Number(current.is_day) !== 0;
  const condition = describeWeatherCode(weatherCode, isDay);
  const dailyHigh = numberOrNull(payload?.daily?.temperature_2m_max?.[0]);
  const dailyLow = numberOrNull(payload?.daily?.temperature_2m_min?.[0]);
  const windGust = numberOrNull(current.wind_gusts_10m);
  const currentTime = String(current.time || '');

  const times = Array.isArray(payload?.hourly?.time) ? payload.hourly.time : [];
  const temperatures = Array.isArray(payload?.hourly?.temperature_2m) ? payload.hourly.temperature_2m : [];
  const precipitation = Array.isArray(payload?.hourly?.precipitation_probability) ? payload.hourly.precipitation_probability : [];
  const weatherCodes = Array.isArray(payload?.hourly?.weather_code) ? payload.hourly.weather_code : [];

  const hourly = times
    .map((time, index) => ({
      time: String(time || ''),
      label: formatWeatherHour(time),
      temperature: numberOrNull(temperatures[index]),
      precipitationProbability: numberOrNull(precipitation[index]) ?? 0,
      ...describeWeatherCode(weatherCodes[index], isDay),
    }))
    .filter(item => item.temperature !== null && (!currentTime || item.time >= currentTime))
    .slice(0, 6);

  const nextRain = hourly.find(item => item.precipitationProbability >= 30 && item.kind === 'rain')
    || hourly.find(item => item.precipitationProbability >= 40);

  const temperatureUnit = context.temperatureSymbol || payload?.current_units?.temperature_2m || '°';
  const windUnit = context.windLabel || payload?.current_units?.wind_gusts_10m || 'km/h';
  const city = String(context.city || '').trim();

  let summary = 'A quick look at the next few hours.';
  if (nextRain?.label) {
    summary = `Rain chance reaches ${Math.round(nextRain.precipitationProbability)}% around ${nextRain.label}.`;
  } else if (windGust !== null && windGust >= (windUnit === 'mph' ? 20 : 32)) {
    summary = `Breezy, with gusts up to ${Math.round(windGust)} ${windUnit}.`;
  }

  return {
    available: true,
    city: city || 'Local weather',
    timezone: String(payload?.timezone || context.timezone || ''),
    temperatureUnit,
    windUnit,
    current: {
      temperature: Math.round(currentTemperature),
      apparentTemperature: numberOrNull(current.apparent_temperature),
      weatherCode,
      isDay,
      condition: condition.label,
      kind: condition.kind,
      windGust: windGust === null ? null : Math.round(windGust),
    },
    today: {
      high: dailyHigh === null ? null : Math.round(dailyHigh),
      low: dailyLow === null ? null : Math.round(dailyLow),
    },
    hourly: hourly.map(item => ({
      label: item.label,
      temperature: Math.round(item.temperature),
      precipitationProbability: Math.round(item.precipitationProbability),
      condition: item.label ? item.label : describeWeatherCode(item.weatherCode, isDay).label,
      kind: item.kind,
    })),
    summary,
  };
}
