'use client';

import { useEffect, useReducer } from 'react';
import { useReducedMotion } from 'motion/react';
import { Pause, Play, RotateCcw, SkipForward, StepBack, StepForward } from 'lucide-react';
import type { Step } from '@/lib/ds/trace';
import { Kbd } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { stepTone, TONE_HEX } from './model';

export type Speed = 0.5 | 1 | 2;
const SPEEDS: readonly Speed[] = [0.5, 1, 2];

interface PlayerState<F> {
  steps: readonly Step<F>[];
  index: number;
  playing: boolean;
  speed: Speed;
  label: string;
  /** Increments on every load, so views can restart entry animations. */
  run: number;
}

type PlayerAction<F> =
  | { type: 'load'; steps: readonly Step<F>[]; label: string; autoplay: boolean }
  | { type: 'tick' }
  | { type: 'toggle' }
  | { type: 'seek'; index: number }
  | { type: 'speed'; speed: Speed };

function playerReducer<F>(s: PlayerState<F>, a: PlayerAction<F>): PlayerState<F> {
  const last = s.steps.length - 1;
  switch (a.type) {
    case 'load': {
      const play = a.autoplay && a.steps.length > 1;
      return { ...s, steps: a.steps, label: a.label, run: s.run + 1, index: play ? 0 : Math.max(0, a.steps.length - 1), playing: play };
    }
    case 'tick': {
      if (!s.playing) return s;
      if (s.index >= last) return { ...s, playing: false };
      const index = s.index + 1;
      return { ...s, index, playing: index < last };
    }
    case 'toggle':
      if (s.steps.length < 2) return s;
      if (s.playing) return { ...s, playing: false };
      return { ...s, playing: true, index: s.index >= last ? 0 : s.index };
    case 'seek': {
      if (last < 0) return s;
      const index = Math.min(last, Math.max(0, Math.round(a.index)));
      return index === s.index && !s.playing ? s : { ...s, index, playing: false };
    }
    case 'speed':
      return { ...s, speed: a.speed };
  }
}

export interface StepPlayer<F> {
  steps: readonly Step<F>[];
  index: number;
  step: Step<F> | null;
  playing: boolean;
  speed: Speed;
  label: string;
  run: number;
  load: (steps: readonly Step<F>[], label: string) => void;
  toggle: () => void;
  seek: (index: number) => void;
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
  setSpeed: (speed: Speed) => void;
}

/** Base delay per step: short traces play slowly enough to read, long ones (sorts, BFS) stay around 16 s at 1×. */
export function stepDelay(total: number, speed: Speed): number {
  return Math.min(800, Math.max(45, 16000 / Math.max(1, total))) / speed;
}

/**
 * Replays an operation's recorded steps. Autoplays on load unless the user prefers reduced motion, in which case
 * it jumps straight to the final step and leaves stepping to the user.
 */
export function useStepPlayer<F>(): StepPlayer<F> {
  const reduced = useReducedMotion() === true;
  const [s, dispatch] = useReducer(playerReducer<F>, { steps: [], index: 0, playing: false, speed: 1, label: '', run: 0 });
  const delay = stepDelay(s.steps.length, s.speed);

  useEffect(() => {
    if (!s.playing) return;
    const id = window.setTimeout(() => dispatch({ type: 'tick' }), delay);
    return () => window.clearTimeout(id);
  }, [s.playing, s.index, s.run, delay]);

  return {
    ...s,
    step: s.steps[s.index] ?? null,
    load: (steps, label) => dispatch({ type: 'load', steps, label, autoplay: !reduced }),
    toggle: () => dispatch({ type: 'toggle' }),
    seek: (index) => dispatch({ type: 'seek', index }),
    next: () => dispatch({ type: 'seek', index: s.index + 1 }),
    prev: () => dispatch({ type: 'seek', index: s.index - 1 }),
    first: () => dispatch({ type: 'seek', index: 0 }),
    last: () => dispatch({ type: 'seek', index: s.steps.length - 1 }),
    setSpeed: (speed) => dispatch({ type: 'speed', speed }),
  };
}

const KIND_LABEL: Record<string, string> = {
  'not-found': 'not found',
  truncated: 'truncated',
};

function IconButton({ label, onClick, disabled, children, primary }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-35',
        primary ? 'size-11 bg-cloud text-midnight hover:bg-white' : 'size-9 text-fg-muted hover:bg-white/[0.07] hover:text-cloud',
      )}
    >
      {children}
    </button>
  );
}

/** Scrubber: a native range input (keyboard + pointer) over a custom track with markers for notable steps. */
function Scrubber<F>({ player }: { player: StepPlayer<F> }) {
  const n = player.steps.length;
  const max = Math.max(0, n - 1);
  const pct = max === 0 ? (n > 0 ? 100 : 0) : (player.index / max) * 100;
  const marks =
    n > 1 && n <= 400
      ? player.steps.flatMap((st, i) => {
          const tone = stepTone(st.kind);
          return tone === 'error' || tone === 'warn' || st.kind === 'found' ? [{ i, tone }] : [];
        })
      : [];
  return (
    <div className="relative mx-2 h-8 min-w-0 flex-1">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full bg-gradient-to-r from-silver/60 to-cloud" style={{ width: `${pct}%` }} />
      </div>
      {marks.map((m) => (
        <span
          key={m.i}
          aria-hidden
          className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${max === 0 ? 0 : (m.i / max) * 100}%`, background: TONE_HEX[m.tone] }}
        />
      ))}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-abyss bg-cloud shadow-[0_0_0_4px_rgba(236,240,241,0.12)]"
        style={{ left: `${pct}%` }}
      />
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(player.index, max)}
        disabled={n < 2}
        onChange={(e) => player.seek(Number(e.target.value))}
        aria-label="Step scrubber"
        aria-valuetext={n ? `Step ${player.index + 1} of ${n}` : 'No steps'}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </div>
  );
}

/** The shared transport bar: caption, controls, scrubber and speed. */
export function PlayerBar<F>({ player, className }: { player: StepPlayer<F>; className?: string }) {
  const n = player.steps.length;
  const step = player.step;
  const tone = step ? stepTone(step.kind) : 'info';
  const atEnd = player.index >= n - 1;
  return (
    <div
      className={cn(
        'rounded-[26px] border border-line-strong bg-[linear-gradient(180deg,rgba(44,61,80,0.97),rgba(35,50,66,0.97))] p-3 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)] sm:p-4',
        className,
      )}
    >
      <div className="flex min-h-11 items-start gap-3 px-1" aria-live={player.playing ? 'off' : 'polite'}>
        {step ? (
          <>
            <span
              className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted"
            >
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: TONE_HEX[tone] }} />
              {KIND_LABEL[step.kind] ?? step.kind}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-cloud text-pretty">{step.message}</p>
          </>
        ) : (
          <p className="text-sm text-fg-subtle">Run an operation above. Every step it takes will replay here.</p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex items-center gap-0.5">
          <IconButton label="Restart (Home)" onClick={player.first} disabled={n < 2 || player.index === 0}>
            <RotateCcw className="size-4" />
          </IconButton>
          <IconButton label="Previous step (Left arrow)" onClick={player.prev} disabled={n < 2 || player.index === 0}>
            <StepBack className="size-4" />
          </IconButton>
          <IconButton label={player.playing ? 'Pause (Space)' : atEnd && n > 1 ? 'Replay (Space)' : 'Play (Space)'} onClick={player.toggle} disabled={n < 2} primary>
            {player.playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </IconButton>
          <IconButton label="Next step (Right arrow)" onClick={player.next} disabled={n < 2 || atEnd}>
            <StepForward className="size-4" />
          </IconButton>
          <IconButton label="Skip to final step (End)" onClick={player.last} disabled={n < 2 || atEnd}>
            <SkipForward className="size-4" />
          </IconButton>
        </div>
        <div className="order-last flex w-full min-w-0 items-center gap-3 sm:order-none sm:w-auto sm:flex-1">
          <Scrubber player={player} />
          <span className="shrink-0 font-mono text-[11px] text-fg-muted tabular">
            {n ? pad3(player.index + 1) : '000'} <span className="text-fg-subtle">/ {pad3(n)}</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-line p-0.5" role="group" aria-label="Playback speed">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              aria-pressed={player.speed === sp}
              onClick={() => player.setSpeed(sp)}
              className={cn(
                'h-7 rounded-full px-2.5 font-mono text-[11px] transition-colors',
                player.speed === sp ? 'bg-cloud text-midnight' : 'text-fg-muted hover:text-cloud',
              )}
            >
              {sp}×
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 hidden items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle md:flex">
        {player.label ? <span className="truncate text-fg-muted">{player.label}</span> : null}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd> step · <Kbd>Space</Kbd> play · <Kbd>Home</Kbd>
          <Kbd>End</Kbd>
        </span>
      </p>
    </div>
  );
}

const pad3 = (n: number) => String(n).padStart(3, '0');
