'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Navigation, Waypoints } from 'lucide-react';
import type { BfsSnapshot } from '@/lib/ds/graph';
import { DISTRICTS } from '@/lib/data';
import { districtGraph } from '@/lib/engine';
import { DistrictSvgMap } from '@/components/map/district-svg-map';
import { buttonClass } from '@/components/ui/primitives';
import { cn, fmtC } from '@/lib/utils';
import { mapSteps, shortName, stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { DistrictSelect, EmptyState, Inspector, MetaTag, OpGroup, StageCard, StatusBadge } from '../ui';

type Mode = 'all' | 'hot';
interface Frame {
  bfs: BfsSnapshot;
  op: 'bfs' | 'nearest';
  start: number;
}

const CLUSTER_FILLS = ['#ffffff', '#d7dee2', '#aab4bc', '#8a96a1', '#6f808f', '#5a6b7b'];
const FILL = { current: '#ffffff', queued: '#ecf0f1', done: '#8a96a1', idle: '#33495d', blocked: '#1a2531' };

function QueueStrip({ queue }: { queue: number[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Static linear queue · front → rear</p>
      <div className="mt-2 flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-void/50 p-2">
        <AnimatePresence initial={false} mode="popLayout">
          {queue.map((v, i) => (
            <motion.span
              key={v}
              layout
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]',
                i === 0 ? 'border-cloud bg-cloud text-midnight' : 'border-line-strong text-cloud',
              )}
            >
              {shortName(v, 12)}
              <span className={cn('font-mono text-[9.5px]', i === 0 ? 'text-midnight/60' : 'text-fg-subtle')}>{v}</span>
            </motion.span>
          ))}
        </AnimatePresence>
        {queue.length === 0 && <span className="px-2 font-mono text-[11px] text-fg-subtle">empty</span>}
      </div>
    </div>
  );
}

function MatrixRow({ row, u, probe, visited }: { row: number[]; u: number; probe: number | null; visited: boolean[] | null }) {
  const ones = row.flatMap((x, j) => (x ? [j] : []));
  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {row.map((x, j) => (
          <span
            key={j}
            title={`adj[${u}][${j}] = ${x} · ${DISTRICTS[j].name}`}
            className={cn(
              'relative grid aspect-square place-items-center rounded-[5px] font-mono text-[9px] transition-[background-color,box-shadow] duration-200',
              x ? 'bg-cloud text-midnight' : 'bg-white/[0.045] text-fg-subtle/70',
              j === u && 'outline outline-1 outline-offset-1 outline-silver/60',
              probe === j && 'ring-2 ring-white ring-offset-2 ring-offset-abyss',
            )}
          >
            {x}
            {visited?.[j] && <span aria-hidden className={cn('absolute bottom-0.5 size-1 rounded-full', x ? 'bg-midnight/60' : 'bg-silver/60')} />}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-fg-muted">
        Row <span className="font-mono text-cloud">{u}</span> ({DISTRICTS[u].name}) has a 1 in columns{' '}
        <span className="font-mono text-cloud">{ones.join(', ')}</span>: {ones.map((j) => DISTRICTS[j].name).join(', ')}. A dot marks a visited column.
      </p>
    </div>
  );
}

export function Exp6HeatSpread({ model, meta, source }: ExpProps) {
  const g = districtGraph();
  const matrix = useMemo(() => g.matrix(), [g]);
  const lab = useLab<Frame | null>(() => null);
  const [mode, setMode] = useState<Mode>('all');
  const [start, setStart] = useState(model.intel.ranking[0]);
  const [nearest, setNearest] = useState<{ from: number; path: number[] | null } | null>(null);

  const isHot = (v: number) => model.rows[v].status.level !== 'green';
  const data = useMemo(() => model.rows.map((r) => ({ tmax: r.tmax, level: r.status.level })), [model]);
  const clusters = model.intel.clusters;
  const clusterOf = useMemo(() => {
    const m = new Map<number, number>();
    clusters.forEach((c, k) => c.forEach((v) => m.set(v, k)));
    return m;
  }, [clusters]);

  const runBfs = (from: number, m: Mode = mode) => {
    setStart(from);
    setNearest(null);
    const t = g.bfs(from, m === 'hot' ? { allow: isHot } : {});
    const levels = t.result.order.reduce((mx, v) => Math.max(mx, t.result.level[v]), 0);
    lab.commit({
      op: 'bfs',
      detail: `From ${DISTRICTS[from].name}${m === 'hot' ? ' through hot districts only' : ''}: ${t.result.order.length} district(s) reached in ${levels} level(s).`,
      tone: 'ok',
      steps: mapSteps(t.steps, (bfs) => ({ bfs, op: 'bfs' as const, start: from })),
    });
  };

  const runNearest = () => {
    const t = g.nearestTraced(start, (v) => !isHot(v));
    const path = t.result;
    setNearest({ from: start, path });
    const end = path ? path[path.length - 1] : null;
    lab.commit({
      op: 'nearest',
      detail:
        path && end !== null
          ? path.length === 1
            ? `${DISTRICTS[start].name} is already below watch level.`
            : `Nearest cooler district to ${DISTRICTS[start].name}: ${DISTRICTS[end].name} (${fmtC(model.rows[end].tmax)}), ${path.length - 1} hop(s).`
          : `No district below watch level is reachable from ${DISTRICTS[start].name}.`,
      tone: path ? 'ok' : 'warn',
      steps: mapSteps(t.steps, (bfs) => ({ bfs, op: 'nearest' as const, start })),
    });
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    lab.reset(null, m === 'hot' ? `Hot-only view: ${clusters.length} contiguous cluster(s) via components().` : 'Whole-graph view.');
    setNearest(null);
  };

  const reset = () => {
    setNearest(null);
    lab.reset(null, 'Graph view reset.');
  };

  const frame = lab.frame;
  const step = lab.player.step;
  const snap = frame?.bfs ?? null;
  const atEnd = lab.player.index === lab.player.steps.length - 1;
  const focus = step?.focus ?? [];
  const u = snap?.current ?? (typeof focus[0] === 'number' ? focus[0] : start);
  const probe = focus.length > 1 && typeof focus[1] === 'number' ? focus[1] : null;
  const inQueue = new Set(snap?.queue ?? []);

  const highlight = snap ? new Set(snap.visited.flatMap((on, v) => (on ? [v] : []))) : mode === 'hot' ? new Set(model.rows.filter((r) => isHot(r.id)).map((r) => r.id)) : null;

  const edges: [number, number][] = [];
  if (snap) {
    snap.parent.forEach((p, v) => {
      if (p >= 0) edges.push([p, v]);
    });
    if (probe !== null && typeof focus[0] === 'number') edges.push([focus[0], probe]);
  }
  const pathShown = frame?.op === 'nearest' && atEnd && nearest?.path ? nearest.path : null;
  const graphEdges = pathShown ? pathShown.slice(1).map((v, i) => [pathShown[i], v] as [number, number]) : edges;

  const nodeFill = (id: number): string | undefined => {
    if (pathShown) return pathShown.includes(id) ? FILL.current : FILL.idle;
    if (snap) {
      if (id === snap.current) return FILL.current;
      if (inQueue.has(id)) return FILL.queued;
      if (snap.visited[id]) return FILL.done;
      if (mode === 'hot' && !isHot(id)) return FILL.blocked;
      return FILL.idle;
    }
    if (mode === 'hot') {
      const k = clusterOf.get(id);
      return k === undefined ? FILL.blocked : CLUSTER_FILLS[Math.min(k, CLUSTER_FILLS.length - 1)];
    }
    return undefined;
  };

  const levels: number[][] = [];
  if (snap) snap.level.forEach((l, v) => (l >= 0 ? (levels[l] ??= []).push(v) : null));
  const visitedCount = snap ? snap.visited.filter(Boolean).length : 0;
  const status = step ? { label: step.kind, tone: stepTone(step.kind) } : null;

  const controls = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <OpGroup op="bfs" complexity="O(V²)" hint="Pick a start district (or click one on the map) and watch BFS scan its matrix row.">
        <DistrictSelect value={start} onChange={setStart} rows={model.rows} className="w-full" label="Start district" />
        <button type="button" onClick={() => runBfs(start)} className={buttonClass('primary', 'sm')}>
          <Waypoints className="size-4" aria-hidden /> Run BFS
        </button>
      </OpGroup>
      <OpGroup op="components" complexity="O(V²)" hint={mode === 'hot' ? `${clusters.length} contiguous hot cluster(s); largest ${clusters[0]?.length ?? 0} districts. BFS may only enter hot districts.` : 'Whole graph: BFS can cross every shared border.'}>
        <div role="group" aria-label="Graph filter" className="flex w-full rounded-full border border-line-strong p-0.5">
          {(['all', 'hot'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => changeMode(m)}
              className={cn('h-8 flex-1 rounded-full px-3 text-[12.5px] transition-colors', mode === m ? 'bg-cloud text-midnight' : 'text-fg-muted hover:text-cloud')}
            >
              {m === 'all' ? 'Whole graph' : 'Hot districts only'}
            </button>
          ))}
        </div>
      </OpGroup>
      <OpGroup op="nearest" complexity="O(V²)" hint={<>Shortest-hop path from <span className="text-cloud">{DISTRICTS[start].name}</span> to the closest district below watch level: where relief can be staged.</>}>
        <button type="button" onClick={runNearest} className={buttonClass('secondary', 'sm')}>
          <Navigation className="size-4" aria-hidden /> Nearest cooler district
        </button>
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={reset}>
      <StageCard
        title="int adj[36][36] · shared borders"
        meta={
          <>
            <MetaTag>V = 36</MetaTag>
            <MetaTag>E = {g.edgeCount}</MetaTag>
            {snap && <MetaTag>visited {visitedCount}</MetaTag>}
          </>
        }
        status={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <DistrictSvgMap
              data={data}
              selected={snap ? (snap.current ?? frame?.start ?? start) : start}
              onSelect={(id) => runBfs(id)}
              highlight={highlight}
              showGraph
              graphEdges={graphEdges}
              nodeFill={nodeFill}
              label="Maharashtra district border graph; click a district to start BFS"
            />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
              {[
                ['current', FILL.current],
                ['in queue', FILL.queued],
                ['visited', FILL.done],
                ['unvisited', FILL.idle],
              ].map(([l, c]) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-full border border-abyss" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="min-w-0 space-y-5">
            <QueueStrip queue={snap?.queue ?? []} />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Now scanning</p>
              <p className="mt-1 font-wide text-2xl font-black tracking-[-0.02em] text-cloud">{snap?.current != null ? DISTRICTS[snap.current].name : snap ? 'Done' : DISTRICTS[start].name}</p>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                {snap?.current != null
                  ? `Level ${snap.level[snap.current]} · row ${snap.current} of the adjacency matrix${probe !== null ? ` · checking column ${probe} (${DISTRICTS[probe].name})` : ''}`
                  : snap
                    ? `${visitedCount} district(s) visited.`
                    : `${fmtC(model.rows[start].tmax)} · click the map or press Run BFS.`}
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">adj[{u}][0 … 35] · the matrix row being scanned</p>
              <MatrixRow row={matrix[u]} u={u} probe={probe} visited={snap?.visited ?? null} />
            </div>
            {pathShown && (
              <div className="rounded-2xl border border-cloud/40 bg-cloud/[0.07] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Relief route · {pathShown.length - 1} hop(s)</p>
                <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-cloud">
                  {pathShown.map((v, i) => (
                    <li key={v} className="inline-flex items-center gap-1.5">
                      {i > 0 && <span className="text-fg-subtle">→</span>}
                      <span>{DISTRICTS[v].name}</span>
                      <span className="font-mono text-[10.5px] text-fg-muted">{model.rows[v].tmax.toFixed(1)}°</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </StageCard>
      <Inspector title={snap ? 'BFS levels (alert rings)' : mode === 'hot' ? 'Contiguous hot clusters' : 'BFS levels'}>
        {snap ? (
          <ol className="space-y-2">
            {levels.map((vs, l) => (
              <li key={l} className="grid grid-cols-[3rem_1fr] items-start gap-3">
                <span className="mt-1 font-mono text-[11px] text-fg-subtle">L{l}</span>
                <span className="flex flex-wrap gap-1.5">
                  {vs.map((v) => (
                    <span key={v} className={cn('rounded-full border px-2.5 py-1 text-[11.5px]', v === snap.current ? 'border-cloud bg-cloud text-midnight' : inQueue.has(v) ? 'border-line-strong text-cloud' : 'border-line text-fg-muted')}>
                      {shortName(v, 14)}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        ) : mode === 'hot' ? (
          <ol className="space-y-2">
            {clusters.map((c, k) => (
              <li key={k} className="grid grid-cols-[4.5rem_1fr] items-start gap-3">
                <span className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: CLUSTER_FILLS[Math.min(k, CLUSTER_FILLS.length - 1)] }} />
                  {c.length} dist.
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {c.map((v) => (
                    <button key={v} type="button" onClick={() => runBfs(v)} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-cloud">
                      {shortName(v, 14)}
                    </button>
                  ))}
                </span>
              </li>
            ))}
            {clusters.length === 0 && <EmptyState>No district is at watch level or above on this day.</EmptyState>}
          </ol>
        ) : (
          <EmptyState>Run BFS to see the districts grouped by hop distance from the start.</EmptyState>
        )}
      </Inspector>
    </Workspace>
  );
}
