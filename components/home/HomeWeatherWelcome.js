'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, getStoredUser } from '@/lib/api-client';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Heart, MapPin,
  MoonStar, Snowflake, Sun, Wind,
} from 'lucide-react';

const ATMOSPHERE = {
  clear: 'from-[#161b43] via-[#232052] to-[#4d285e]',
  'partly-cloudy': 'from-[#171b3f] via-[#29224f] to-[#493057]',
  cloudy: 'from-[#171a31] via-[#26243e] to-[#3b2c4d]',
  fog: 'from-[#1b2132] via-[#2d2e42] to-[#46384d]',
  rain: 'from-[#10182b] via-[#1d2340] to-[#352b4c]',
  snow: 'from-[#1a2638] via-[#2c3650] to-[#463d5a]',
  storm: 'from-[#0d1325] via-[#211d39] to-[#3c2849]',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function readableDate() {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date());
}

function WeatherIcon({ kind, condition = '', className = '' }) {
  if (kind === 'storm') return <CloudLightning className={className} aria-hidden="true" />;
  if (kind === 'snow') return <Snowflake className={className} aria-hidden="true" />;
  if (kind === 'rain') return <CloudRain className={className} aria-hidden="true" />;
  if (kind === 'fog') return <CloudFog className={className} aria-hidden="true" />;
  if (kind === 'partly-cloudy') return <CloudSun className={className} aria-hidden="true" />;
  if (kind === 'clear') {
    return /night/i.test(condition)
      ? <MoonStar className={className} aria-hidden="true" />
      : <Sun className={className} aria-hidden="true" />;
  }
  return <Cloud className={className} aria-hidden="true" />;
}

function WeatherLoading() {
  return (
    <div className="mt-4 animate-pulse" aria-label="Loading local weather">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2"><div className="h-4 w-28 rounded-full bg-white/15" /><div className="h-5 w-36 rounded-full bg-white/15" /></div>
        <div className="h-12 w-20 rounded-2xl bg-white/10" />
      </div>
      <div className="mt-3 h-16 rounded-2xl bg-white/[0.07]" />
    </div>
  );
}

export default function HomeWeatherWelcome() {
  const [user, setUser] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherState, setWeatherState] = useState('loading');

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      const stored = getStoredUser();
      if (stored) {
        if (active) setUser(stored);
        return;
      }
      const me = await apiFetch('/auth/me').catch(() => null);
      if (active && me?.user) setUser(me.user);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/weather', { headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!active) return;
        if (data?.available) {
          setWeather(data);
          setWeatherState('ready');
        } else {
          setWeatherState('unavailable');
        }
      })
      .catch(() => { if (active) setWeatherState('unavailable'); });
    return () => { active = false; };
  }, []);

  const firstName = user?.name?.split(' ')[0] || '';
  const kind = weather?.current?.kind || 'cloudy';
  const atmosphere = ATMOSPHERE[kind] || ATMOSPHERE.cloudy;
  const unitLetter = String(weather?.temperatureUnit || '').replace('°', '');
  const todayHigh = weather?.today?.high ?? weather?.range24h?.high ?? null;
  const todayLow = weather?.today?.low ?? weather?.range24h?.low ?? null;

  return (
    <section
      data-testid="home-weather-welcome"
      className={`relative mx-auto max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/12 bg-gradient-to-br ${atmosphere} p-4 shadow-xl shadow-black/20 md:p-5`}
      aria-label="Welcome and local weather"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        aria-hidden="true"
        style={{
          backgroundImage: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.14) 0 1px, transparent 1.5px), radial-gradient(circle at 72% 30%, rgba(255,255,255,.10) 0 1px, transparent 1.5px)',
          backgroundSize: '52px 52px, 82px 82px',
        }}
      />
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-fuchsia-400/14 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -left-12 h-52 w-52 rounded-full bg-cyan-300/8 blur-3xl" aria-hidden="true" />

      <div className="relative">
        <header className="flex items-start gap-2.5">
          <Link
            data-testid="home-avatar-link"
            href="/settings"
            aria-label="Open settings"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black ring-1 ring-white/20 backdrop-blur"
            style={{ background: user?.avatarColor || 'rgba(168,85,247,.72)' }}
          >
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-white/58">{readableDate()}</p>
            <h1 className="truncate text-[22px] font-black tracking-tight md:text-[25px]">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
            <p className="mt-0.5 text-xs text-white/55">Here’s your day at a glance.</p>
          </div>
          <Link
            data-testid="home-trusted-circle-link"
            href="/trusted-circle"
            aria-label="Open your trusted circle"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-black/15 backdrop-blur"
          >
            <Heart className="h-[18px] w-[18px] text-pink-100" aria-hidden="true" />
          </Link>
        </header>

        {weatherState === 'loading' && <WeatherLoading />}

        {weatherState === 'unavailable' && (
          <div data-testid="home-weather-unavailable" className="mt-4 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5 text-xs text-white/65 backdrop-blur">
            <Cloud className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Local weather is temporarily unavailable. Home will continue normally.</span>
          </div>
        )}

        {weatherState === 'ready' && weather && (
          <div data-testid="home-weather-card" className="mt-4">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 pb-0.5">
                <div className="inline-flex max-w-full items-center gap-1 text-xs font-bold text-white/66">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{weather.city}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-white/34">approx.</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <WeatherIcon kind={kind} condition={weather.current.condition} className="h-6 w-6 text-white" />
                  <p className="text-base font-black">{weather.current.condition}</p>
                </div>
              </div>

              <div className="shrink-0 text-right" aria-label={`${weather.current.temperature} ${weather.temperatureUnit}`}>
                <div className="flex items-start justify-end">
                  <span className="text-[50px] font-extralight leading-[0.82] tracking-[-0.06em] md:text-[56px]">{weather.current.temperature}°</span>
                  {unitLetter && <span className="ml-1 mt-0.5 text-[10px] font-black text-white/48">{unitLetter}</span>}
                </div>
              </div>
            </div>

            <div data-testid="home-weather-daily-brief" className="mt-3 rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5 backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-black uppercase tracking-wide text-white/46">
                <span>Today</span>
                {todayHigh !== null && todayLow !== null && <span>H:{todayHigh}° · L:{todayLow}°</span>}
                {weather.current.wind !== null && (
                  <span className="inline-flex items-center gap-1 normal-case tracking-normal text-white/44"><Wind className="h-3 w-3" aria-hidden="true" />{weather.current.wind} {weather.windUnit} now</span>
                )}
              </div>
              <p className="mt-1.5 text-[13px] font-semibold leading-[1.35rem] text-white/82">
                {weather.dailyBrief?.text || weather.summary}
              </p>
            </div>

            {weather.attribution && (
              <p className="mt-1.5 text-right text-[9px] font-medium text-white/28">
                Data: <a href={weather.attribution.providerUrl} target="_blank" rel="noreferrer" className="underline decoration-white/15 underline-offset-2">{weather.attribution.provider}</a>
                {' · '}
                <a href={weather.attribution.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-white/15 underline-offset-2">{weather.attribution.license}</a>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
