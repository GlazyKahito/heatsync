import districtsRaw from '@/data/districts.json';
import replayRaw from '@/data/replay.json';
import normalsRaw from '@/data/normals.json';
import { classify, type HeatStatus } from './heat';

export interface District {
  id: number;
  name: string;
  aliases: string[];
  subdivision: 'Konkan' | 'Madhya Maharashtra' | 'Marathwada' | 'Vidarbha';
  division: string;
  coastal: boolean;
  hqPin: string;
  lat: number;
  lon: number;
  areaKm2: number;
  neighbors: number[];
}

export const DISTRICTS = districtsRaw as District[];
export const DISTRICT_COUNT = DISTRICTS.length;
export const SUBDIVISIONS = ['Konkan', 'Madhya Maharashtra', 'Marathwada', 'Vidarbha'] as const;

/** One district on one day, with everything the modules need. */
export interface DayRow {
  id: number;
  tmax: number;
  feels: number | null;
  rh: number | null;
  wind: number | null;
  normal: number | null;
  status: HeatStatus;
}

export interface Snapshot {
  mode: 'replay' | 'live';
  day: string; // ISO date
  rows: DayRow[]; // index = district id
  source: string;
  fetchedAt?: string;
}

const tenth = (v: number | null | undefined) => (v == null ? null : v / 10);

// ── normals (ERA5 2015–2024, 1 Mar – 30 Jun) ──────────────────────────────────────────────────────────────────────
const NORMALS = (normalsRaw as { normals: number[][] }).normals;

/** Day index within the 1 Mar – 30 Jun season, or -1 outside it. */
export function seasonIndex(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  const startOfMonth = [0, 0, 0, 0, 31, 61, 92]; // Mar, Apr, May, Jun offsets at index 3..6
  if (m < 3 || m > 6) return -1;
  return startOfMonth[m] + d - 1;
}

export function normalFor(districtId: number, iso: string): number | null {
  const i = seasonIndex(iso);
  return i < 0 ? null : NORMALS[districtId][i] / 10;
}

// ── historical replay: May 2024 ──────────────────────────────────────────────────────────────────────────────────
interface ReplayRaw {
  source: string;
  days: string[];
  tmax: (number | null)[][];
  feels: (number | null)[][];
  rh: (number | null)[][];
  wind: (number | null)[][];
  hourlyStart: string;
  hourly: (number | null)[][];
}
const REPLAY = replayRaw as ReplayRaw;

export const REPLAY_DAYS = REPLAY.days;
/** Replay window shown in the UI: the build-up and peak of the late-May 2024 heatwave. */
export const REPLAY_WINDOW = REPLAY.days.filter((d) => d >= '2024-05-15');
/** Peak of the event in ERA5: Nagpur 45.8 °C, 19 districts at or above 40 °C. */
export const REPLAY_DEFAULT = '2024-05-26';
export const REPLAY_SOURCE = 'ERA5 reanalysis via Open-Meteo (CC BY 4.0)';

export function makeRow(id: number, tmax: number, feels: number | null, rh: number | null, wind: number | null, iso: string): DayRow {
  const normal = normalFor(id, iso);
  return { id, tmax, feels, rh, wind, normal, status: classify({ tmax, normal, coastal: DISTRICTS[id].coastal }) };
}

export function replaySnapshot(iso: string = REPLAY_DEFAULT): Snapshot {
  const k = REPLAY.days.indexOf(iso);
  const i = k < 0 ? REPLAY.days.indexOf(REPLAY_DEFAULT) : k;
  const rows = DISTRICTS.map((d) =>
    makeRow(d.id, tenth(REPLAY.tmax[d.id][i]) ?? 0, tenth(REPLAY.feels[d.id][i]), REPLAY.rh[d.id][i], REPLAY.wind[d.id][i], REPLAY.days[i]),
  );
  return { mode: 'replay', day: REPLAY.days[i], rows, source: REPLAY_SOURCE };
}

/** Hourly 2 m temperature for one district: the `hours` values ending at 14:00 IST on `iso` (replay only). */
export function replayHourly(districtId: number, iso: string, hours = 24): { t: string; v: number }[] {
  const start = new Date(`${REPLAY.hourlyStart}:00+05:30`).getTime();
  const end = new Date(`${iso}T14:00:00+05:30`).getTime();
  const endIdx = Math.round((end - start) / 3_600_000);
  const out: { t: string; v: number }[] = [];
  for (let i = Math.max(0, endIdx - hours + 1); i <= endIdx; i++) {
    const v = REPLAY.hourly[districtId][i];
    if (v == null) continue;
    const at = new Date(start + i * 3_600_000 + 5.5 * 3_600_000);
    out.push({ t: `${at.toISOString().slice(5, 10)} ${at.toISOString().slice(11, 13)}:00`, v: v / 10 });
  }
  return out;
}

/** Districts ordered hottest first (used where a quick ranking is enough — the BST does the real work in modules). */
export const hottestFirst = (s: Snapshot) => [...s.rows].sort((a, b) => b.tmax - a.tmax);

export function summarize(s: Snapshot) {
  const counts = { green: 0, yellow: 0, orange: 0, red: 0 };
  let max = s.rows[0];
  for (const r of s.rows) {
    counts[r.status.level]++;
    if (r.tmax > max.tmax) max = r;
  }
  const atOrAbove40 = s.rows.filter((r) => r.tmax >= 40).length;
  return { counts, max, atOrAbove40, heatwave: counts.orange + counts.red };
}
