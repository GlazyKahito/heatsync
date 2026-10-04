'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { History, RotateCcw } from 'lucide-react';
import type { Experiment } from '@/lib/ds/meta';
import { buttonClass } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { CodeViewer } from './code-viewer';
import { pad2, TONE_HEX, type CSource } from './model';
import { PlayerBar } from './step-player';
import type { Lab, LabRun } from './use-lab';

function WorkspaceHeader({ meta }: { meta: Experiment }) {
  return (
    <header className="relative overflow-hidden rounded-[28px] border border-line bg-gradient-to-br from-asphalt/80 via-midnight to-night p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,rgba(236,240,241,0.10),transparent_65%)]" />
      <span aria-hidden className="pointer-events-none absolute right-5 top-3 font-wide text-[clamp(4.5rem,11vw,8rem)] font-black leading-none tracking-[-0.05em] text-cloud/[0.06] sm:right-8">
        {pad2(meta.exp)}
      </span>
      <p className="relative font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-muted">
        Exp {pad2(meta.exp)} · {meta.title}
      </p>
      <h2 className="relative mt-3 font-wide text-[clamp(1.75rem,4vw,2.75rem)] font-black leading-[0.98] tracking-[-0.03em] text-cloud">{meta.module}</h2>
      <div className="relative mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
        <p className="text-[15px] leading-relaxed text-cloud/90 text-pretty">
          <span className="mr-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">Aim</span>
          {meta.aim}
        </p>
        <p className="text-[14px] leading-relaxed text-fg-muted text-pretty">
          <span className="mr-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">In HEATSYNC</span>
          {meta.role}
        </p>
      </div>
    </header>
  );
}

function OpsLog<F>({ log, activeRun, onReplay }: { log: LabRun<F>[]; activeRun: number | null; onReplay: (run: LabRun<F>) => void }) {
  return (
    <section className="glass min-w-0 rounded-[28px] p-5 sm:p-6" aria-label="Operations log">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">
          <History className="size-3.5" aria-hidden /> Operations log
        </h3>
        <span className="font-mono text-[10.5px] text-fg-subtle">newest first</span>
      </div>
      {log.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-subtle">
          Every call is logged here. Select an entry to replay its steps.
        </p>
      ) : (
        <ol data-lenis-prevent className="scrollbar-thin mt-4 max-h-72 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
          {log.map((run) => {
            const active = run.id === activeRun;
            const replayable = run.steps.length > 0;
            return (
              <li key={run.id}>
                <button
                  type="button"
                  disabled={!replayable}
                  onClick={() => onReplay(run)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'group grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
                    active ? 'border-line-strong bg-white/[0.07]' : 'border-transparent hover:bg-white/[0.04]',
                    !replayable && 'cursor-default',
                  )}
                >
                  <span className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-fg-subtle tabular">
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: TONE_HEX[run.tone] }} />#{pad2(run.id)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[12px] text-cloud">{run.op}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">{run.detail}</span>
                  </span>
                  <span className="mt-0.5 font-mono text-[10px] text-fg-subtle tabular">
                    {replayable ? `${run.steps.length} step${run.steps.length === 1 ? '' : 's'}` : '—'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const matchesOp = (name: string, op: string | null) => op !== null && (name === op || name.split(/[\s/()]+/).includes(op));

function ComplexityTable({ meta, activeOp }: { meta: Experiment; activeOp: string | null }) {
  return (
    <section className="glass min-w-0 rounded-[28px] p-5 sm:p-6" aria-label="Complexity">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">Time complexity</h3>
      <table className="mt-4 w-full text-left text-[13px]">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
            <th scope="col" className="pb-2 font-normal">Operation</th>
            <th scope="col" className="pb-2 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody>
          {meta.ops.map((o) => {
            const on = matchesOp(o.name, activeOp);
            return (
              <tr key={o.name} className={cn('border-t border-line transition-colors', on && 'bg-white/[0.06]')}>
                <td className={cn('py-2 pl-2 font-mono text-[12px]', on ? 'text-cloud' : 'text-fg-muted')}>
                  {on && <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-cloud align-middle" />}
                  {o.name}
                </td>
                <td className={cn('py-2 pr-2 text-right font-mono text-[12px] tabular', on ? 'text-cloud' : 'text-fg-subtle')}>{o.complexity}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const IGNORE_KEYS_IN = 'input, textarea, select, [contenteditable="true"], [role="slider"]';

/**
 * Shared experiment layout: header, operations, the experiment's own visualization (children), a sticky step player,
 * the log, the complexity table and the C source. Arrow keys / Space / Home / End drive the player while focus is
 * anywhere inside the workspace except text fields and sliders.
 */
export function Workspace<F>({
  meta,
  source,
  lab,
  controls,
  onReset,
  children,
}: {
  meta: Experiment;
  source: CSource;
  lab: Lab<F>;
  controls: ReactNode;
  onReset: () => void;
  children: ReactNode;
}) {
  const { player } = lab;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.closest(IGNORE_KEYS_IN)) return;
    if (e.key === 'ArrowRight') player.next();
    else if (e.key === 'ArrowLeft') player.prev();
    else if (e.key === 'Home') player.first();
    else if (e.key === 'End') player.last();
    else if ((e.key === ' ' || e.key === 'k') && !target.closest('button, a, summary')) player.toggle();
    else return;
    e.preventDefault();
  };

  return (
    <div className="grid grid-cols-1 min-w-0 gap-5" onKeyDown={onKeyDown}>
      <WorkspaceHeader meta={meta} />
      <section className="glass rounded-[28px] p-4 sm:p-5" aria-label="Operations">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">Operations · real data</h3>
          <button type="button" onClick={onReset} className={buttonClass('ghost', 'sm', 'h-8 px-3 font-mono text-[11px]')}>
            <RotateCcw className="size-3.5" aria-hidden /> Reset
          </button>
        </div>
        {controls}
      </section>
      {/* the player's sticky range is this block, so it only docks once the visualization is on screen */}
      <div className="grid grid-cols-1 min-w-0 gap-5">
        <div
          tabIndex={0}
          aria-label={`${meta.module} visualization. Use the left and right arrow keys to step, Space to play or pause.`}
          className="grid grid-cols-1 min-w-0 gap-5 rounded-[30px] focus-visible:outline-offset-4"
        >
          {children}
        </div>
        <div className="sticky bottom-3 z-30">
          <PlayerBar player={player} />
        </div>
      </div>
      <div className="grid grid-cols-1 min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <OpsLog log={lab.log} activeRun={lab.activeRun} onReplay={lab.replay} />
        <ComplexityTable meta={meta} activeOp={lab.activeOp} />
      </div>
      <CodeViewer source={source} />
    </div>
  );
}
