import type { Experiment } from '@/lib/ds/meta';
import type { Step } from '@/lib/ds/trace';
import { DISTRICTS, replaySnapshot, summarize, REPLAY_WINDOW, type DayRow, type Snapshot } from '@/lib/data';
import { analyse, type Intel } from '@/lib/engine';
import { heatRgb } from '@/lib/heat';

/** Everything an experiment needs from the selected replay day. */
export interface DayModel {
  day: string;
  snapshot: Snapshot;
  rows: DayRow[];
  intel: Intel;
}

export interface CSource {
  file: string;
  code: string;
}

export interface ExpProps {
  model: DayModel;
  meta: Experiment;
  source: CSource;
}

export type Tone = 'ok' | 'warn' | 'error' | 'info';

export const TONE_HEX: Record<Tone, string> = {
  ok: 'var(--color-imd-green)',
  warn: 'var(--color-imd-yellow)',
  error: 'var(--color-imd-red)',
  info: 'var(--color-silver)',
};

export function buildModel(day: string): DayModel {
  const snapshot = replaySnapshot(day);
  return { day: snapshot.day, snapshot, rows: snapshot.rows, intel: analyse(snapshot) };
}

/** Step kinds mapped to a data-marker tone for captions, ticks and the log. */
export function stepTone(kind: string): Tone {
  switch (kind) {
    case 'error':
    case 'truncated':
      return 'error';
    case 'not-found':
    case 'blocked':
    case 'full':
    case 'prune':
      return 'warn';
    case 'found':
    case 'collect':
    case 'result':
    case 'insert':
    case 'enqueue':
    case 'done':
      return 'ok';
    default:
      return 'info';
  }
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Display name trimmed for tight spaces ("Chhatrapati Sambhajinagar" → "Ch. Sambhajinagar"). */
export function shortName(id: number, max = 12): string {
  const name = DISTRICTS[id]?.name ?? `#${id}`;
  if (name.length <= max) return name;
  const parts = name.split(' ');
  if (parts.length > 1) {
    const abbr = `${parts[0].slice(0, 2)}. ${parts.slice(1).join(' ')}`;
    if (abbr.length <= max + 2) return abbr;
  }
  return `${name.slice(0, max - 1)}…`;
}

/** True when text on this heat colour should be dark for contrast. */
export function isLightHeat(t: number): boolean {
  const [r, g, b] = heatRgb(t);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 132;
}

/** Re-wraps each step's snapshot so different operations can share one player. */
export function mapSteps<S, F>(steps: readonly Step<S>[], wrap: (snapshot: S, step: Step<S>) => F): Step<F>[] {
  return steps.map((s) => {
    const out: Step<F> = { kind: s.kind, message: s.message, snapshot: wrap(s.snapshot, s) };
    if (s.focus) out.focus = s.focus;
    return out;
  });
}

/** Districts sorted by name, for pickers. */
export const DISTRICTS_BY_NAME = [...DISTRICTS].sort((a, b) => a.name.localeCompare(b.name));

export interface DaySummary {
  day: string;
  hot: number;
  heatwave: number;
  maxId: number;
  maxT: number;
}

let summaries: DaySummary[] | null = null;
/** One line per replay day: districts at or above 40 °C, heatwave count and the hottest district. */
export function daySummaries(): DaySummary[] {
  if (summaries) return summaries;
  summaries = REPLAY_WINDOW.map((day) => {
    const s = summarize(replaySnapshot(day));
    return { day, hot: s.atOrAbove40, heatwave: s.heatwave, maxId: s.max.id, maxT: s.max.tmax };
  });
  return summaries;
}

/** Signed departure rounded to the data's 0.1 °C resolution, or -99 when no normal exists (never fires a rule). */
export function departure(row: DayRow): number {
  return row.normal == null ? -99 : Math.round((row.tmax - row.normal) * 10) / 10;
}
