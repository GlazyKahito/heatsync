/**
 * Heatwave classification, following the India Meteorological Department's published criteria:
 *   plains   — Tmax ≥ 40 °C and departure from normal ≥ 4.5 °C → heatwave, ≥ 6.5 °C → severe heatwave;
 *              or actual Tmax ≥ 45 °C → heatwave, ≥ 47 °C → severe heatwave
 *   coastal  — Tmax ≥ 37 °C and departure ≥ 4.5 °C → heatwave (≥ 6.5 °C treated as severe here)
 * "Normal" in HEATSYNC is the ERA5 2015–2024 mean for the same calendar window (±7 days) — a documented proxy for
 * IMD's station normals, which are not openly published as a dataset.
 *
 * Levels use IMD's colour-coded warning vocabulary. "Watch" (yellow) is HEATSYNC's own early flag: a hot day that
 * does not yet meet the heatwave criteria.
 */

export type Level = 'green' | 'yellow' | 'orange' | 'red';

export interface HeatInput {
  tmax: number;
  /** null outside the March–June season, where no normal is defined: departure-based criteria are then skipped */
  normal: number | null;
  coastal: boolean;
}

export interface HeatStatus {
  level: Level;
  departure: number | null;
  reason: string;
}

export const LEVELS: Record<Level, { label: string; short: string; color: string; rank: number; action: string }> = {
  green: { label: 'No warning', short: 'Normal', color: 'var(--color-imd-green)', rank: 0, action: 'No action' },
  yellow: { label: 'Heat watch', short: 'Watch', color: 'var(--color-imd-yellow)', rank: 1, action: 'Be aware' },
  orange: { label: 'Heatwave', short: 'Heatwave', color: 'var(--color-imd-orange)', rank: 2, action: 'Be prepared' },
  red: { label: 'Severe heatwave', short: 'Severe', color: 'var(--color-imd-red)', rank: 3, action: 'Take action' },
};

export const LEVEL_HEX: Record<Level, string> = { green: '#7fb69a', yellow: '#f2cf5b', orange: '#f29b54', red: '#e8655f' };

export function classify({ tmax, normal, coastal }: HeatInput): HeatStatus {
  const departure = normal == null ? null : tmax - normal;
  const dep = departure ?? -Infinity; // unknown normal never satisfies a departure criterion
  const d = departure == null ? 'n/a' : departure.toFixed(1);
  if (coastal) {
    if (tmax >= 37 && dep >= 6.5) return { level: 'red', departure, reason: `Coastal: ${tmax.toFixed(1)} °C, ${d} °C above normal (≥ 6.5)` };
    if (tmax >= 37 && dep >= 4.5) return { level: 'orange', departure, reason: `Coastal: ${tmax.toFixed(1)} °C, ${d} °C above normal (≥ 4.5)` };
    if (tmax >= 37) return { level: 'yellow', departure, reason: `Coastal hot day: ${tmax.toFixed(1)} °C ≥ 37 °C, departure ${d} °C` };
    return { level: 'green', departure, reason: `Below the 37 °C coastal threshold` };
  }
  if (tmax >= 47) return { level: 'red', departure, reason: `Actual Tmax ${tmax.toFixed(1)} °C ≥ 47 °C` };
  if (tmax >= 40 && dep >= 6.5) return { level: 'red', departure, reason: `${tmax.toFixed(1)} °C, ${d} °C above normal (≥ 6.5)` };
  if (tmax >= 45) return { level: 'orange', departure, reason: `Actual Tmax ${tmax.toFixed(1)} °C ≥ 45 °C` };
  if (tmax >= 40 && dep >= 4.5) return { level: 'orange', departure, reason: `${tmax.toFixed(1)} °C, ${d} °C above normal (≥ 4.5)` };
  if (tmax >= 40) return { level: 'yellow', departure, reason: `Hot day: ${tmax.toFixed(1)} °C ≥ 40 °C, departure ${d} °C` };
  return { level: 'green', departure, reason: `Below the 40 °C plains threshold` };
}

/** The same criteria written as HEATSYNC rules — compiled by the stack-based rule compiler (EXP3). */
export const IMD_RULES = {
  plains: {
    severe: 'tmax >= 47 || (tmax >= 40 && dep >= 6.5)',
    heatwave: 'tmax >= 45 || (tmax >= 40 && dep >= 4.5)',
    watch: 'tmax >= 40',
  },
  coastal: {
    severe: 'tmax >= 37 && dep >= 6.5',
    heatwave: 'tmax >= 37 && dep >= 4.5',
    watch: 'tmax >= 37',
  },
} as const;

/** Temperature → colour on the palette's own ramp (Wet Asphalt → Silver → Soft Bright Gray), white-hot at the top. */
const RAMP: [number, [number, number, number]][] = [
  [28, [0x2c, 0x3d, 0x50]],
  [34, [0x33, 0x49, 0x5d]],
  [38, [0x6f, 0x80, 0x8f]],
  [41, [0xbd, 0xc3, 0xc7]],
  [44, [0xec, 0xf0, 0xf1]],
  [47, [0xff, 0xff, 0xff]],
];

export function heatRgb(t: number): [number, number, number] {
  if (t <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    const [t0, c0] = RAMP[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export const heatHex = (t: number) => `#${heatRgb(t).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const HEAT_RAMP_CSS = `linear-gradient(90deg, ${RAMP.map(([t, c]) => `rgb(${c.join(' ')}) ${(((t - 28) / (47 - 28)) * 100).toFixed(0)}%`).join(', ')})`;
