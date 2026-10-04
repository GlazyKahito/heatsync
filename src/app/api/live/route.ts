import { NextResponse } from 'next/server';
import { DISTRICTS } from '@/lib/data';

export const dynamic = 'force-dynamic';

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';

interface OMLocation {
  current?: { time: string; temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number };
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    apparent_temperature_max: (number | null)[];
    relative_humidity_2m_mean: (number | null)[];
    wind_speed_10m_max: (number | null)[];
  };
  hourly: { time: string[]; temperature_2m: (number | null)[] };
}

export interface LivePayload {
  source: string;
  fetchedAt: string;
  days: string[];
  districts: {
    tmax: (number | null)[];
    feels: (number | null)[];
    rh: (number | null)[];
    wind: (number | null)[];
    now: { time: string; t: number; rh: number; feels: number } | null;
    last24: { t: string; v: number }[];
  }[];
}

/**
 * Live 7-day guidance for every district point from Open-Meteo's forecast API (one multi-location request), cached
 * for 30 minutes upstream and at the edge. No keys and no database: the response is the whole state of "live" mode.
 */
export async function GET() {
  const params = new URLSearchParams({
    latitude: DISTRICTS.map((d) => d.lat).join(','),
    longitude: DISTRICTS.map((d) => d.lon).join(','),
    daily: 'temperature_2m_max,apparent_temperature_max,relative_humidity_2m_mean,wind_speed_10m_max',
    hourly: 'temperature_2m',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature',
    timezone: 'Asia/Kolkata',
    past_days: '1',
    forecast_days: '7',
  });
  try {
    const res = await fetch(`${URL_BASE}?${params}`, { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const raw = (await res.json()) as OMLocation[] | OMLocation;
    const rows = Array.isArray(raw) ? raw : [raw];
    if (rows.length !== DISTRICTS.length) throw new Error('unexpected location count');

    // drop yesterday from the daily arrays (past_days=1 exists only to give a full last-24h hourly window)
    const days = rows[0].daily.time.slice(1);
    const payload: LivePayload = {
      source: 'Open-Meteo forecast API (CC BY 4.0)',
      fetchedAt: new Date().toISOString(),
      days,
      districts: rows.map((r) => {
        const nowIso = r.current?.time ?? '';
        const end = Math.max(0, r.hourly.time.findIndex((t) => t > nowIso) - 1);
        const last24 = r.hourly.time
          .slice(Math.max(0, end - 23), end + 1)
          .map((t, i) => ({ t: `${t.slice(5, 10)} ${t.slice(11, 16)}`, v: r.hourly.temperature_2m[Math.max(0, end - 23) + i] }))
          .filter((x): x is { t: string; v: number } => x.v != null);
        return {
          tmax: r.daily.temperature_2m_max.slice(1),
          feels: r.daily.apparent_temperature_max.slice(1),
          rh: r.daily.relative_humidity_2m_mean.slice(1),
          wind: r.daily.wind_speed_10m_max.slice(1),
          now: r.current
            ? { time: r.current.time, t: r.current.temperature_2m, rh: r.current.relative_humidity_2m, feels: r.current.apparent_temperature }
            : null,
          last24,
        };
      }),
    };
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } });
  } catch (err) {
    return NextResponse.json(
      { error: 'Live feed unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
