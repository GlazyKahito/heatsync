'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowDownUp, History, Loader2, RotateCw, Search } from 'lucide-react';
import {
  binarySearch,
  insertionSort,
  lowerBound,
  mergeSort,
  percentileRank,
  quickSort,
  upperBound,
  type BinarySearchSnapshot,
  type SortSnapshot,
} from '@/lib/ds/sort-search';
import { compareNumbers, type Step } from '@/lib/ds/trace';
import { DISTRICTS, REPLAY_DAYS, replaySnapshot } from '@/lib/data';
import { heatHex } from '@/lib/heat';
import { buttonClass } from '@/components/ui/primitives';
import { cn, fmtC, fmtDay } from '@/lib/utils';
import { mapSteps, stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { DistrictSelect, inputClass, MetaTag, OpGroup, Stat, StageCard, StatusBadge, Inspector } from '../ui';

type Algo = 'insertionSort' | 'quickSort' | 'mergeSort';
type Frame = { kind: 'sort'; algo: Algo; snap: SortSnapshot<number> } | { kind: 'search'; snap: BinarySearchSnapshot; target: number } | null;

const ALGOS: { id: Algo; label: string; cx: string }[] = [
  { id: 'insertionSort', label: 'Insertion', cx: 'O(n²)' },
  { id: 'quickSort', label: 'Quick', cx: 'O(n log n) avg' },
  { id: 'mergeSort', label: 'Merge', cx: 'O(n log n)' },
];
const SORTS = { insertionSort, quickSort, mergeSort };

// ── data ──
interface Archive {
  years: number[];
  seasonDays: number;
  seasonStart: string;
  tmax: number[][];
}
let archivePromise: Promise<Archive> | null = null;
function loadArchive(): Promise<Archive> {
  archivePromise ??= fetch('/data/archive.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Archive>;
    })
    .catch((e: unknown) => {
      archivePromise = null;
      throw e;
    });
  return archivePromise;
}

function useArchive() {
  const [state, setState] = useState<{ data: Archive | null; error: string | null }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadArchive().then(
      (data) => alive && setState({ data, error: null }),
      (e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : 'Network error' }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = () => {
    setState({ data: null, error: null });
    setAttempt((a) => a + 1);
  };
  return { ...state, retry };
}

let mayCache: number[][] | null = null;
/** Daily Tmax for 1–31 May 2024, one array per day (index = district id). */
function mayValues(id: number): number[] {
  mayCache ??= REPLAY_DAYS.map((d) => replaySnapshot(d).rows.map((r) => r.tmax));
  return mayCache.map((row) => row[id]);
}

/** Comparisons and writes performed up to step `index`, following sort-search.ts's counting conventions. */
function countersAt(steps: readonly Step<Frame>[], index: number): { c: number; w: number } {
  let c = 0;
  let w = 0;
  for (let i = 0; i <= index && i < steps.length; i++) {
    const s = steps[i];
    const f = s.snapshot;
    if (!f || f.kind !== 'sort') continue;
    if (f.algo === 'insertionSort') {
      if (s.kind === 'compare') c++;
      else if (s.kind === 'shift') {
        c++;
        w++;
      } else if (s.kind === 'write') w++;
    } else if (f.algo === 'quickSort') {
      if (s.kind === 'compare') c++;
      else if (s.kind === 'swap') w += 2;
    } else if (s.kind === 'write') {
      w++;
      if (!s.message.includes('used up')) c++;
    }
  }
  return { c, w };
}

// ── visuals ──
function SortBars({ values, snap, focus, dim }: { values: number[]; snap: SortSnapshot<number> | null; focus: Set<number | string>; dim: boolean }) {
  const arr = snap?.array ?? values;
  const lo = Math.min(...values) - 0.5;
  const hi = Math.max(...values) + 0.2;
  const h = (v: number) => 14 + ((v - lo) / (hi - lo)) * 150;
  const pivot = snap?.pivot;
  return (
    <div className="relative">
      <div className="relative flex h-44 items-end gap-[3px] sm:gap-1">
        {pivot !== undefined && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-cloud/80" style={{ bottom: h(pivot) }}>
            <span className="absolute -top-5 left-0 rounded-md bg-abyss/90 px-1.5 py-0.5 font-mono text-[9.5px] text-cloud">pivot {pivot.toFixed(1)}</span>
          </span>
        )}
        {arr.map((v, i) => {
          const active = !snap || (i >= snap.lo && i <= snap.hi);
          const on = focus.has(i);
          return (
            <span
              key={i}
              title={`a[${i}] = ${v.toFixed(1)} °C`}
              className={cn(
                'relative block flex-1 rounded-t-[4px] transition-[height,opacity,transform] duration-150 ease-out',
                !active && 'opacity-25',
                dim && 'opacity-60',
                on && '-translate-y-1.5 outline outline-2 outline-offset-1 outline-white',
              )}
              style={{ height: h(v), background: heatHex(v) }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px] font-mono text-[8.5px] text-fg-subtle sm:gap-1">
        {arr.map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {i % 5 === 0 ? i : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

const W = 640;
const H = 210;
const PADX = 8;
const PADY = 18;

/** Index → x and value → y for the sorted-archive chart. */
function curveScale(sorted: readonly number[]) {
  const n = sorted.length;
  const vmin = sorted[0];
  const vmax = sorted[n - 1];
  return {
    x: (i: number) => PADX + (i / Math.max(1, n - 1)) * (W - PADX * 2),
    y: (v: number) => H - PADY - ((v - vmin) / Math.max(0.1, vmax - vmin)) * (H - PADY * 2),
  };
}

function curvePath(sorted: readonly number[]) {
  const { x, y } = curveScale(sorted);
  const n = sorted.length;
  const pts: string[] = [];
  for (let i = 0; i < n; i += 4) pts.push(`${x(i).toFixed(1)},${y(sorted[i]).toFixed(1)}`);
  pts.push(`${x(n - 1).toFixed(1)},${y(sorted[n - 1]).toFixed(1)}`);
  return `M${pts.join(' L')}`;
}

function SearchCurve({ sorted, snap, target, dayT, dayIdx }: { sorted: number[]; snap: BinarySearchSnapshot | null; target: number | null; dayT: number; dayIdx: number }) {
  const n = sorted.length;
  const vmin = sorted[0];
  const vmax = sorted[n - 1];
  const { x, y } = curveScale(sorted);
  const path = useMemo(() => curvePath(sorted), [sorted]);
  const showWin = snap && snap.lo <= snap.hi;
  const winLo = snap ? Math.max(0, snap.lo) : 0;
  const winHi = snap ? Math.min(n - 1, Math.max(snap.hi, snap.lo)) : n - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sorted archive values with the binary search window">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PADX} x2={W - PADX} y1={PADY + f * (H - 2 * PADY)} y2={PADY + f * (H - 2 * PADY)} stroke="rgba(236,240,241,0.06)" />
      ))}
      {snap && (
        <motion.rect
          initial={false}
          animate={{ x: x(winLo) - 2, width: Math.max(3, x(winHi) - x(winLo) + 4), opacity: showWin ? 1 : 0.4 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          y={PADY - 8}
          height={H - PADY * 2 + 16}
          rx={8}
          fill="rgba(236,240,241,0.08)"
          stroke="rgba(236,240,241,0.25)"
        />
      )}
      <path d={path} fill="none" stroke="#bdc3c7" strokeWidth={2} />
      {target !== null && target >= vmin - 2 && target <= vmax + 2 && (
        <g>
          <line x1={PADX} x2={W - PADX} y1={y(target)} y2={y(target)} stroke="#ecf0f1" strokeDasharray="4 4" strokeOpacity={0.6} />
          <text x={PADX + 4} y={y(target) - 5} fontSize="10" className="font-mono" fill="#ecf0f1">
            target {target.toFixed(1)}°
          </text>
        </g>
      )}
      {snap && snap.mid >= 0 && (
        <motion.g initial={false} animate={{ x: x(snap.mid) }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
          <line x1={0} x2={0} y1={PADY - 10} y2={H - PADY + 10} stroke="#ffffff" strokeWidth={1.5} />
          <circle cx={0} cy={y(sorted[snap.mid])} r={5} fill="#ffffff" stroke="#1a2531" strokeWidth={2} />
          <text x={snap.mid > n * 0.7 ? -6 : 6} y={PADY - 2} textAnchor={snap.mid > n * 0.7 ? 'end' : 'start'} fontSize="10" className="font-mono" fill="#ffffff">
            a[{snap.mid}] = {sorted[snap.mid].toFixed(1)}°
          </text>
        </motion.g>
      )}
      <g>
        <circle cx={x(dayIdx)} cy={y(dayT)} r={4} fill={heatHex(dayT)} stroke="#ffffff" strokeWidth={1.5} />
      </g>
      <text x={PADX} y={H - 3} fontSize="9.5" className="font-mono" fill="#8a96a1">
        a[0] = {vmin.toFixed(1)}°
      </text>
      <text x={W - PADX} y={H - 3} textAnchor="end" fontSize="9.5" className="font-mono" fill="#8a96a1">
        a[{n - 1}] = {vmax.toFixed(1)}°
      </text>
    </svg>
  );
}

function Histogram({ sorted, dayT, target }: { sorted: number[]; dayT: number; target: number | null }) {
  const bins = useMemo(() => {
    const start = Math.floor(sorted[0]);
    const end = Math.floor(sorted[sorted.length - 1]);
    const out: { t: number; count: number }[] = [];
    for (let t = start; t <= end; t++) out.push({ t, count: upperBound(sorted, t + 0.95) - lowerBound(sorted, t) });
    return out;
  }, [sorted]);
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-[2px]">
        {bins.map((b) => {
          const isDay = Math.floor(dayT) === b.t;
          const isTarget = target !== null && Math.floor(target) === b.t;
          return (
            <span
              key={b.t}
              title={`${b.t}–${b.t + 0.9} °C: ${b.count} days`}
              className={cn('block flex-1 rounded-t-[3px] transition-opacity', isTarget && !isDay && 'outline outline-1 outline-offset-1 outline-cloud')}
              style={{ height: `${Math.max(2, (b.count / max) * 100)}%`, background: isDay ? '#ffffff' : heatHex(b.t + 0.5), opacity: isDay ? 1 : 0.75 }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] font-mono text-[9px] text-fg-subtle">
        {bins.map((b) => (
          <span key={b.t} className="flex-1 text-center">
            {b.t % 5 === 0 ? `${b.t}°` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Exp7ClimateArchive({ model, meta, source }: ExpProps) {
  const lab = useLab<Frame>(() => null);
  const archive = useArchive();
  const [district, setDistrict] = useState(model.intel.ranking[0]);
  const [algo, setAlgo] = useState<Algo>('insertionSort');
  const [arrA, setArrA] = useState<number[]>(() => mayValues(model.intel.ranking[0]));
  const [sortedOnce, setSortedOnce] = useState<{ algo: Algo; comparisons: number; writes: number } | null>(null);
  const [targetText, setTargetText] = useState('');
  const [searchRun, setSearchRun] = useState<{ target: number; found: boolean; index: number; insertAt: number; comparisons: number } | null>(null);

  const dayT = model.rows[district].tmax;
  const hist = useMemo(() => {
    if (!archive.data) return null;
    const values = archive.data.tmax[district].map((v) => v / 10);
    return { ...mergeSort(values, compareNumbers), n: values.length };
  }, [archive.data, district]);
  const sorted = hist?.sorted ?? null;
  const pct = sorted ? percentileRank(sorted, dayT) : NaN;
  const atLeast = sorted ? sorted.length - lowerBound(sorted, dayT) : 0;
  const years = archive.data ? `${archive.data.years[0]}–${archive.data.years[archive.data.years.length - 1]}` : '2015–2025';
  const target = targetText.trim() === '' ? dayT : Number(targetText);
  const validTarget = Number.isFinite(target);

  const changeDistrict = (id: number) => {
    setDistrict(id);
    setArrA(mayValues(id));
    setSortedOnce(null);
    setSearchRun(null);
    lab.reset(null, `Loaded ${DISTRICTS[id].name}: 31 May-2024 values and its ${years} archive.`);
  };

  const sort = () => {
    const wasSorted = arrA.every((v, i) => i === 0 || arrA[i - 1] <= v);
    const r = SORTS[algo](arrA, compareNumbers, { trace: true });
    setArrA(r.sorted);
    setSortedOnce({ algo, comparisons: r.comparisons, writes: r.writes });
    lab.commit({
      op: algo,
      detail: `${arrA.length} values${wasSorted ? ' (already sorted)' : ''}: ${r.comparisons} comparisons, ${r.writes} writes.`,
      tone: 'ok',
      steps: mapSteps(r.steps, (snap) => ({ kind: 'sort' as const, algo, snap })),
    });
  };

  const restore = () => {
    setArrA(mayValues(district));
    setSortedOnce(null);
    lab.reset(null, 'Dataset A restored to calendar order (1 → 31 May).');
  };

  const search = (e?: FormEvent) => {
    e?.preventDefault();
    if (!sorted || !validTarget) return;
    const t = binarySearch(sorted, target, compareNumbers);
    const r = t.result;
    setSearchRun({ target, found: r.found, index: r.index, insertAt: r.insertAt, comparisons: r.comparisons });
    lab.commit({
      op: 'binarySearch',
      detail: r.found ? `${target.toFixed(1)} °C found at a[${r.index}] in ${r.comparisons} comparisons (of ${sorted.length}).` : `${target.toFixed(1)} °C not present; insert at ${r.insertAt}. ${r.comparisons} comparisons.`,
      tone: r.found ? 'ok' : 'warn',
      steps: mapSteps(t.steps, (snap) => ({ kind: 'search' as const, snap, target })),
    });
  };

  const frame = lab.frame;
  const step = lab.player.step;
  const focus = new Set<number | string>(step?.focus ?? []);
  const sortSnap = frame?.kind === 'sort' ? frame.snap : null;
  const searchSnap = frame?.kind === 'search' ? frame.snap : null;
  const counters = frame?.kind === 'sort' ? countersAt(lab.player.steps, lab.player.index) : sortedOnce ? { c: sortedOnce.comparisons, w: sortedOnce.writes } : { c: 0, w: 0 };
  const shownAlgo = frame?.kind === 'sort' ? frame.algo : (sortedOnce?.algo ?? algo);
  const status = step ? { label: step.kind, tone: stepTone(step.kind) } : null;
  const isSortedA = arrA.every((v, i) => i === 0 || arrA[i - 1] <= v);

  const controls = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <OpGroup op="dataset" hint={<>A: {DISTRICTS[district].name}’s 31 daily maxima of May 2024. B: its {years} season archive (1 Mar – 30 Jun, 1,342 days).</>}>
        <DistrictSelect value={district} onChange={changeDistrict} rows={model.rows} className="w-full" />
      </OpGroup>
      <OpGroup op="insertionSort / quickSort / mergeSort" complexity={ALGOS.find((a) => a.id === algo)?.cx} hint={isSortedA ? 'Dataset A is sorted. Sorting again shows each algorithm’s best case.' : 'Sort dataset A and watch every comparison.'}>
        <div role="group" aria-label="Sorting algorithm" className="flex w-full rounded-full border border-line-strong p-0.5">
          {ALGOS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={algo === a.id}
              onClick={() => setAlgo(a.id)}
              className={cn('h-8 flex-1 rounded-full px-2 text-[12.5px] transition-colors', algo === a.id ? 'bg-cloud text-midnight' : 'text-fg-muted hover:text-cloud')}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={sort} className={buttonClass('primary', 'sm')}>
          <ArrowDownUp className="size-4" aria-hidden /> Sort
        </button>
        <button type="button" onClick={restore} disabled={!sortedOnce} className={buttonClass('ghost', 'sm')}>
          <History className="size-4" aria-hidden /> Calendar order
        </button>
      </OpGroup>
      <OpGroup op="binarySearch" complexity="O(log n)" hint={sorted ? `Search the sorted ${sorted.length.toLocaleString('en-IN')}-day archive for a temperature.` : 'Waiting for the archive…'}>
        <form onSubmit={search} className="flex w-full min-w-0 gap-2">
          <input
            value={targetText}
            onChange={(e) => setTargetText(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder={dayT.toFixed(1)}
            aria-label="Temperature to search, °C"
            className={inputClass}
          />
          <button type="submit" disabled={!sorted || !validTarget} className={buttonClass('secondary', 'sm', 'h-10 shrink-0')}>
            <Search className="size-4" aria-hidden /> Search
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {[dayT, 40, 45].map((v, i) => (
            <button
              key={`${i}-${v}`}
              type="button"
              onClick={() => setTargetText(v.toFixed(1))}
              className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-cloud"
            >
              {i === 0 ? `today ${v.toFixed(1)}` : `${v.toFixed(1)}`}
            </button>
          ))}
        </div>
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={restore}>
      <StageCard
        title={`Dataset A · ${DISTRICTS[district].name} · 1–31 May 2024`}
        meta={
          <>
            <MetaTag>n = {arrA.length}</MetaTag>
            <MetaTag>{ALGOS.find((a) => a.id === shownAlgo)?.label} sort</MetaTag>
          </>
        }
        status={status && frame?.kind === 'sort' ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : undefined}
      >
        <SortBars values={arrA} snap={sortSnap} focus={frame?.kind === 'sort' ? focus : new Set()} dim={frame?.kind === 'search'} />
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="comparisons" value={counters.c} />
          <Stat label="writes" value={counters.w} />
          <Stat label="range" value={sortSnap ? `${sortSnap.lo}…${sortSnap.hi}` : `0…${arrA.length - 1}`} sub="active lo … hi" />
          <Stat label="order" value={isSortedA && !sortSnap ? 'sorted' : sortSnap ? 'sorting' : 'calendar'} />
        </div>
      </StageCard>

      <StageCard
        title={`Dataset B · ${years} archive · sorted once by mergeSort`}
        meta={hist ? <MetaTag>{hist.comparisons.toLocaleString('en-IN')} comparisons to sort {hist.n.toLocaleString('en-IN')} values</MetaTag> : undefined}
        status={status && frame?.kind === 'search' ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : undefined}
      >
        {!sorted ? (
          <div className="grid min-h-60 place-items-center text-center">
            {archive.error ? (
              <div>
                <p className="text-sm text-fg-muted">The archive could not be loaded ({archive.error}).</p>
                <button type="button" onClick={archive.retry} className={buttonClass('secondary', 'sm', 'mt-3')}>
                  <RotateCw className="size-4" aria-hidden /> Retry
                </button>
              </div>
            ) : (
              <p className="inline-flex items-center gap-2 font-mono text-[12px] text-fg-subtle">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading 11 seasons of daily maxima…
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">percentileRank()</p>
              <p className="mt-2 font-wide text-5xl font-black leading-none tracking-[-0.04em] text-cloud tabular">
                {pct.toFixed(1)}
                <span className="text-2xl text-fg-muted">%</span>
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-fg-muted text-pretty">
                {fmtDay(model.day)} in {DISTRICTS[district].name} ({fmtC(dayT)}) was hotter than <span className="text-cloud">{pct.toFixed(1)}%</span> of season days {years}. Only{' '}
                <span className="text-cloud">{atLeast}</span> of {sorted.length.toLocaleString('en-IN')} days {atLeast === 1 ? 'was' : 'were'} as hot or hotter.
              </p>
              {searchRun && (frame?.kind !== 'search' || lab.player.index === lab.player.steps.length - 1) && (
                <div className="mt-4 rounded-2xl border border-line bg-white/[0.03] p-3 font-mono text-[11.5px] text-fg-muted">
                  <p>
                    target <span className="text-cloud">{searchRun.target.toFixed(1)}°</span> · {searchRun.found ? <>found at a[{searchRun.index}]</> : <>absent, insert at {searchRun.insertAt}</>}
                  </p>
                  <p className="mt-1">
                    {searchRun.comparisons} comparisons · ⌈log₂ {sorted.length}⌉ = {Math.ceil(Math.log2(sorted.length))}
                  </p>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <SearchCurve sorted={sorted} snap={searchSnap} target={frame?.kind === 'search' ? frame.target : (searchRun?.target ?? null)} dayT={dayT} dayIdx={lowerBound(sorted, dayT)} />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['lo', 'mid', 'hi'] as const).map((k) => (
                  <div key={k} className="rounded-2xl border border-line bg-white/[0.025] px-3 py-2 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">{k}</p>
                    <p className="font-wide text-lg font-black text-cloud tabular">{searchSnap ? (searchSnap[k] < 0 ? '—' : searchSnap[k]) : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </StageCard>

      {sorted && (
        <Inspector title={`Distribution · ${DISTRICTS[district].name} · ${sorted.length.toLocaleString('en-IN')} days`} aside={<span className="font-mono text-[10.5px] text-fg-subtle">1 °C bins · white = {fmtDay(model.day, false)}</span>}>
          <Histogram sorted={sorted} dayT={dayT} target={searchRun?.target ?? null} />
        </Inspector>
      )}
    </Workspace>
  );
}
