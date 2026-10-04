'use client';

import { useRef, useState } from 'react';
import type { Step } from '@/lib/ds/trace';
import type { Tone } from './model';
import { useStepPlayer, type StepPlayer } from './step-player';

/** One logged operation; its steps stay replayable from the log. */
export interface LabRun<F> {
  id: number;
  /** Engine operation name, matched against the complexity table. */
  op: string;
  detail: string;
  tone: Tone;
  steps: readonly Step<F>[];
}

export interface CommitInput<F> {
  op: string;
  detail: string;
  tone: Tone;
  steps: readonly Step<F>[];
  /** State after the operation; defaults to the last step's snapshot. */
  base?: F;
}

export interface Lab<F> {
  player: StepPlayer<F>;
  /** Live state after the most recent operation. */
  base: F;
  /** What the visualization shows: the current step's snapshot, or the live state when nothing is loaded. */
  frame: F;
  log: LabRun<F>[];
  activeRun: number | null;
  activeOp: string | null;
  commit: (input: CommitInput<F>) => void;
  replay: (run: LabRun<F>) => void;
  reset: (base: F, detail?: string) => void;
}

const LOG_LIMIT = 40;

/** Player + operations log + live state for one experiment workspace. */
export function useLab<F>(initial: () => F): Lab<F> {
  const player = useStepPlayer<F>();
  const [base, setBase] = useState<F>(initial);
  const [log, setLog] = useState<LabRun<F>[]>([]);
  const [activeRun, setActiveRun] = useState<number | null>(null);
  const seq = useRef(0);

  const commit = (input: CommitInput<F>) => {
    seq.current += 1;
    const id = seq.current;
    const run: LabRun<F> = { id, op: input.op, detail: input.detail, tone: input.tone, steps: input.steps };
    setLog((l) => [run, ...l].slice(0, LOG_LIMIT));
    const last = input.steps[input.steps.length - 1];
    if (input.base !== undefined) setBase(input.base);
    else if (last) setBase(last.snapshot);
    setActiveRun(id);
    player.load(input.steps, `#${String(id).padStart(2, '0')} · ${input.op}`);
  };

  const replay = (run: LabRun<F>) => {
    setActiveRun(run.id);
    player.load(run.steps, `#${String(run.id).padStart(2, '0')} · ${run.op} (replay)`);
  };

  const reset = (next: F, detail = 'Structure cleared.') => {
    seq.current += 1;
    const id = seq.current;
    setBase(next);
    setLog((l) => [{ id, op: 'reset', detail, tone: 'info' as Tone, steps: [] }, ...l].slice(0, LOG_LIMIT));
    setActiveRun(null);
    player.load([], '');
  };

  const activeOp = activeRun === null ? null : (log.find((r) => r.id === activeRun)?.op ?? null);
  const frame = player.step ? player.step.snapshot : base;
  return { player, base, frame, log, activeRun, activeOp, commit, replay, reset };
}
