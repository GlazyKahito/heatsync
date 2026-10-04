'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowDownToLine, ArrowUpFromLine, Gauge, RefreshCcw, Timer } from 'lucide-react';
import { CircularQueue, statsTraced, type CircularQueueSnapshot, type QueueStats } from '@/lib/ds/circular-queue';
import type { Step } from '@/lib/ds/trace';
import { DISTRICTS, replayHourly } from '@/lib/data';
import type { Reading } from '@/lib/engine';
import { heatHex } from '@/lib/heat';
import { buttonClass } from '@/components/ui/primitives';
import { cn, fmtC, fmtDay } from '@/lib/utils';
import { isLightHeat, mapSteps, stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { DistrictSelect, Inspector, MetaTag, OpGroup, Stat, StageCard, StatusBadge } from '../ui';

const CAP = 12;
type QSnap = CircularQueueSnapshot<Reading>;
interface Frame {
  queue: QSnap;
  /** Slot being read by the stats walk. */
  cursor: number | null;
  walk: QueueStats | null;
}

const describe = (r: Reading) => `${r.v.toFixed(1)} °C (${r.t.slice(6)})`;
const create = () => new CircularQueue<Reading>(CAP, { describe });
const asFrame = (queue: QSnap): Frame => ({ queue, cursor: null, walk: null });

// ring geometry in a 320 × 320 viewBox
const C = 160;
const R0 = 84;
const R1 = 128;

function polar(r: number, a: number) {
  return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
}

function segmentPath(i: number, n: number) {
  const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.018;
  const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - 0.018;
  return `M${polar(R1, a0)} A${R1},${R1} 0 0 1 ${polar(R1, a1)} L${polar(R0, a1)} A${R0},${R0} 0 0 0 ${polar(R0, a0)}Z`;
}

function liveStats(q: QSnap): QueueStats {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let k = 0; k < q.count; k++) {
    const r = q.slots[(q.front + k) % q.capacity];
    if (!r) continue;
    min = Math.min(min, r.v);
    max = Math.max(max, r.v);
    sum += r.v;
    count++;
  }
  return count ? { min, max, mean: sum / count, count } : { min: NaN, max: NaN, mean: NaN, count: 0 };
}

/** A pointer that orbits the ring, always taking the short way round (so 11 → 0 wraps forward). */
function OrbitPointer({ index, n, label, inner, dim }: { index: number; n: number; label: string; inner?: boolean; dim?: boolean }) {
  const target = ((index + 0.5) / n) * 360;
  const rot = useMotionValue(target);
  const upright = useTransform(rot, (v) => -v);
  const reduced = useReducedMotion() === true;
  useEffect(() => {
    const cur = rot.get();
    const delta = ((((target - cur) % 360) + 540) % 360) - 180;
    if (reduced || Math.abs(delta) < 0.01) {
      rot.set(cur + delta);
      return;
    }
    const ctl = animate(rot, cur + delta, { type: 'spring', stiffness: 220, damping: 28 });
    return () => ctl.stop();
  }, [target, rot, reduced]);
  return (
    <motion.div aria-hidden className={cn('pointer-events-none absolute inset-0 transition-opacity', dim && 'opacity-35')} style={{ rotate: rot }}>
      <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: inner ? `${((C - R0 + 4) / 320) * 100}%` : '0.5%' }}>
        {inner ? (
          <>
            <span className="h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-silver" />
            <motion.span style={{ rotate: upright }} className="mt-0.5 rounded-md bg-silver px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-midnight">
              {label}
            </motion.span>
          </>
        ) : (
          <>
            <motion.span style={{ rotate: upright }} className="rounded-md bg-cloud px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-midnight">
              {label}
            </motion.span>
            <span className="mt-0.5 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-cloud" />
          </>
        )}
      </div>
    </motion.div>
  );
}

function Ring({ q, focus, stats }: { q: QSnap; focus: Set<number | string>; stats: QueueStats }) {
  const n = q.capacity;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem]">
      <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full" role="img" aria-label={`Circular queue with ${q.count} of ${n} slots used, front ${q.front}, rear ${q.rear}`}>
        <circle cx={C} cy={C} r={R1 + 2} fill="none" stroke="rgba(236,240,241,0.06)" />
        {q.slots.map((r, i) => {
          const on = focus.has(i);
          const mid = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
          const [tx, ty] = polar((R0 + R1) / 2, mid).split(',').map(Number);
          const [lx, ly] = polar(R1 + 13, mid).split(',').map(Number);
          return (
            <g key={i}>
              <path
                d={segmentPath(i, n)}
                fill={r ? heatHex(r.v) : '#1d2a38'}
                stroke={on ? '#ffffff' : r ? 'rgba(26,37,49,0.6)' : 'rgba(236,240,241,0.10)'}
                strokeWidth={on ? 3 : 1}
                className="transition-[fill,stroke] duration-300"
              >
                <title>{r ? `slots[${i}] = ${r.v.toFixed(1)} °C at ${r.t}` : `slots[${i}] empty`}</title>
              </path>
              {r && (
                <text x={tx} y={ty + 3.5} textAnchor="middle" fontSize="10.5" className="font-mono" fill={isLightHeat(r.v) ? '#2c3d50' : '#ecf0f1'}>
                  {r.v.toFixed(1)}
                </text>
              )}
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize="9" className="font-mono" fill={on ? '#ffffff' : '#8a96a1'}>
                {i}
              </text>
            </g>
          );
        })}
      </svg>
      <OrbitPointer index={q.front} n={n} label="front" dim={q.count === 0} />
      {q.rear >= 0 && <OrbitPointer index={q.rear} n={n} label="rear" inner dim={q.count === 0} />}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-fg-subtle">count</p>
          <p className="font-wide text-3xl font-black leading-none tracking-[-0.03em] text-cloud tabular">
            {q.count}
            <span className="text-base text-fg-subtle">/{n}</span>
          </p>
          <p className="mt-1 font-mono text-[10px] text-fg-muted tabular">max {Number.isNaN(stats.max) ? '—' : `${stats.max.toFixed(1)}°`}</p>
        </div>
      </div>
    </div>
  );
}

function statusOf(step: Step<Frame> | null) {
  if (!step) return null;
  const labels: Record<string, string> = { advance: 'rear advances', enqueue: 'Enqueued', read: 'Read front', dequeue: 'front advances', full: 'Full · overwrite', visit: 'Walk', skip: 'Skip', done: 'Done' };
  if (step.kind === 'error') return { label: step.message.startsWith('Overflow') ? 'Overflow' : 'Underflow', tone: stepTone('error') };
  return { label: labels[step.kind] ?? step.kind, tone: stepTone(step.kind) };
}

export function Exp4SensorRing({ model, meta, source }: ExpProps) {
  const ds = useRef<CircularQueue<Reading> | null>(null);
  const get = () => (ds.current ??= create());
  const lab = useLab<Frame>(() => asFrame(create().snapshot()));
  const [district, setDistrict] = useState(model.intel.ranking[0]);
  const [used, setUsed] = useState(0);
  const readings = useMemo(() => replayHourly(district, model.day, 48), [district, model.day]);
  const range = useMemo(() => ({ lo: Math.min(...readings.map((x) => x.v)), hi: Math.max(...readings.map((x) => x.v)) }), [readings]);
  const next = readings[used] ?? null;

  const commitQueue = (op: string, detail: string, tone: 'ok' | 'error' | 'info', steps: readonly Step<QSnap>[]) =>
    lab.commit({ op, detail, tone, steps: mapSteps(steps, asFrame) });

  const enqueue = () => {
    if (!next) return;
    const t = get().enqueue(next);
    if (t.result.ok) setUsed(used + 1);
    commitQueue('enqueue', t.result.ok ? `${describe(next)} → slots[${t.result.index}].` : `Overflow: count = capacity = ${CAP}; use ring push to overwrite.`, t.result.ok ? 'ok' : 'error', t.steps);
  };

  const dequeue = () => {
    const t = get().dequeue();
    commitQueue('dequeue', t.result.ok ? `Removed ${describe(t.result.item)} from slots[${t.result.index}].` : 'Underflow: the ring is empty.', t.result.ok ? 'ok' : 'error', t.steps);
  };

  const ringPush = (count: number) => {
    const q = get();
    const steps: Step<QSnap>[] = [];
    let k = 0;
    let evicted = 0;
    for (; k < count && used + k < readings.length; k++) {
      const t = q.push(readings[used + k]);
      if (t.result.evicted) evicted++;
      steps.push(...t.steps);
    }
    if (k === 0) return;
    setUsed(used + k);
    commitQueue(
      'push',
      count === 1 ? `${describe(readings[used])} written${evicted ? ', oldest reading overwritten' : ''}.` : `${k} hourly readings pushed, ${evicted} overwritten in place.`,
      'ok',
      steps,
    );
  };

  const walk = () => {
    const t = statsTraced(get(), (r) => r.v);
    const r = t.result;
    lab.commit({
      op: 'stats',
      detail: r.count ? `Walked ${r.count} slot(s) from front: max ${fmtC(r.max)}, min ${fmtC(r.min)}, mean ${fmtC(r.mean)}.` : 'The ring is empty.',
      tone: r.count ? 'ok' : 'info',
      steps: mapSteps(t.steps, (s) => ({ queue: s.queue, cursor: s.cursor, walk: { min: s.min, max: s.max, mean: s.mean, count: s.count } })),
      base: asFrame(get().snapshot()),
    });
  };

  const reset = (id = district) => {
    ds.current = create();
    setUsed(0);
    lab.reset(asFrame(ds.current.snapshot()), `Ring cleared for ${DISTRICTS[id].name}: front = 0, rear = −1, count = 0.`);
  };

  const changeDistrict = (id: number) => {
    setDistrict(id);
    reset(id);
  };

  const frame = lab.frame;
  const q = frame.queue;
  const step = lab.player.step;
  const focus = new Set<number | string>(step?.focus ?? []);
  const shown = frame.walk ?? liveStats(q);
  const status = statusOf(step);

  const controls = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <OpGroup
        op="station feed"
        hint={
          <>
            {readings.length} hourly readings ending 14:00 on {fmtDay(model.day, false)}.{' '}
            {next ? (
              <>
                Next: <span className="text-cloud">{next.t.slice(6)}</span> · {fmtC(next.v)}
              </>
            ) : (
              'All readings consumed.'
            )}
          </>
        }
      >
        <DistrictSelect value={district} onChange={changeDistrict} rows={model.rows} className="w-full" label="Station district" />
      </OpGroup>
      <OpGroup op="enqueue / dequeue" complexity="O(1)" hint="Counter method: full when count = 12, empty when count = 0. Enqueue on a full ring overflows.">
        <button type="button" onClick={enqueue} disabled={!next} className={buttonClass('primary', 'sm')}>
          <ArrowDownToLine className="size-4" aria-hidden /> Enqueue next
        </button>
        <button type="button" onClick={dequeue} className={buttonClass('secondary', 'sm')}>
          <ArrowUpFromLine className="size-4" aria-hidden /> Dequeue
        </button>
      </OpGroup>
      <OpGroup op="push (overwrite oldest) / stats" complexity="O(1) · O(n)" hint="Ring push drops the oldest reading when full, so the window keeps rolling.">
        <button type="button" onClick={() => ringPush(1)} disabled={!next} className={buttonClass('secondary', 'sm')}>
          <RefreshCcw className="size-4" aria-hidden /> Ring push
        </button>
        <button type="button" onClick={() => ringPush(24)} disabled={!next} className={buttonClass('secondary', 'sm')}>
          <Timer className="size-4" aria-hidden /> Fill 24h
        </button>
        <button type="button" onClick={walk} className={buttonClass('ghost', 'sm')}>
          <Gauge className="size-4" aria-hidden /> Stats
        </button>
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={() => reset()}>
      <StageCard
        title={`float ring[${CAP}] · ${DISTRICTS[district].name}`}
        meta={
          <>
            <MetaTag>front {q.front}</MetaTag>
            <MetaTag>rear {q.rear}</MetaTag>
            <MetaTag>
              count {q.count}/{CAP}
            </MetaTag>
          </>
        }
        status={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Ring q={q} focus={focus} stats={shown} />
          <div className="min-w-0 space-y-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Physical array · indices wrap with (i + 1) % {CAP}</p>
              <ol className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
                {q.slots.map((r, i) => (
                  <li key={i} className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        'grid h-11 w-full place-items-center rounded-lg border font-mono text-[10.5px] transition-[background-color,border-color] duration-300',
                        r ? 'border-transparent' : 'border-dashed border-line text-fg-subtle',
                        focus.has(i) && 'ring-2 ring-white ring-offset-2 ring-offset-abyss',
                      )}
                      style={r ? { background: heatHex(r.v), color: isLightHeat(r.v) ? '#2c3d50' : '#ecf0f1' } : undefined}
                    >
                      {r ? r.v.toFixed(1) : '·'}
                    </span>
                    <span className="font-mono text-[9px] text-fg-subtle">{i}</span>
                    <span className="h-3 font-mono text-[8.5px] uppercase leading-3 text-cloud">
                      {i === q.front && q.count > 0 ? 'F' : ''}
                      {i === q.rear && q.count > 0 ? (i === q.front ? '·R' : 'R') : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={frame.walk ? 'max so far' : 'rolling max'} value={Number.isNaN(shown.max) ? '—' : `${shown.max.toFixed(1)}°`} />
              <Stat label={frame.walk ? 'min so far' : 'rolling min'} value={Number.isNaN(shown.min) ? '—' : `${shown.min.toFixed(1)}°`} />
              <Stat label="mean" value={Number.isNaN(shown.mean) ? '—' : `${shown.mean.toFixed(1)}°`} />
              <Stat label="readings" value={shown.count} />
            </div>
          </div>
        </div>
      </StageCard>
      <Inspector title={`Hourly feed · ${readings.length} readings`} aside={<span className="font-mono text-[10.5px] text-fg-subtle">{used} consumed</span>}>
        <div className="overflow-x-auto pb-1">
          <ol className="flex h-28 min-w-[34rem] items-end gap-[3px]">
            {readings.map((r, i) => {
              const h = 18 + ((r.v - range.lo) / Math.max(0.1, range.hi - range.lo)) * 72;
              return (
                <li key={r.t} className="relative flex flex-1 flex-col items-center justify-end" title={`${r.t} · ${r.v.toFixed(1)} °C`}>
                  {i === used && <span className="absolute -top-5 font-mono text-[9px] uppercase text-cloud">next</span>}
                  <span
                    className={cn('block w-full rounded-t-[3px] transition-opacity duration-300', i < used ? 'opacity-100' : 'opacity-30', i === used && 'opacity-100 outline outline-1 outline-offset-2 outline-cloud')}
                    style={{ height: h, background: heatHex(r.v) }}
                  />
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex min-w-[34rem] justify-between font-mono text-[9.5px] text-fg-subtle">
            {readings.filter((_, i) => i % 12 === 0 || i === readings.length - 1).map((r) => (
              <span key={r.t}>{r.t}</span>
            ))}
          </div>
        </div>
      </Inspector>
    </Workspace>
  );
}
