'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, GitFork, ListTree, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { BST, type BSTDeleteCase, type BSTNodeView, type BSTSnapshot } from '@/lib/ds/bst';
import type { Step } from '@/lib/ds/trace';
import { DISTRICTS } from '@/lib/data';
import { compareHeat, type HeatKey } from '@/lib/engine';
import { heatHex } from '@/lib/heat';
import { buttonClass } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { DISTRICTS_BY_NAME, isLightHeat, mapSteps, shortName, stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { DistrictSelect, EmptyState, Inspector, MetaTag, OpGroup, SelectField, Stat, StageCard, StatusBadge } from '../ui';

type TSnap = BSTSnapshot<HeatKey, number>;
type Op5 = 'insert' | 'search' | 'delete' | 'traverse' | 'range';
interface Frame {
  tree: TSnap;
  op: Op5;
}

const describeKey = (k: HeatKey) => (DISTRICTS[k.id] ? `${k.t.toFixed(1)} °C ${DISTRICTS[k.id].name}` : `${k.t.toFixed(1)} °C`);
const create = () => new BST<HeatKey, number>(compareHeat, { describeKey });

const XGAP = 46;
const YGAP = 58;
const PAD = 30;
const R = 17;
const ease = [0.16, 1, 0.3, 1] as const;

interface Placed {
  node: BSTNodeView<HeatKey, number>;
  x: number;
  y: number;
  parent: string | null;
}

/** Same rule as BST.layout() (x = in-order index, y = depth), applied to a snapshot so every replay frame can be drawn. */
function layoutTree(snap: TSnap): Placed[] {
  const byId = new Map(snap.nodes.map((n) => [n.id, n]));
  const out: Placed[] = [];
  const walk = (id: string | null, depth: number, parent: string | null) => {
    const node = id === null ? undefined : byId.get(id);
    if (!node) return;
    walk(node.left, depth + 1, node.id);
    out.push({ node, x: out.length, y: depth, parent });
    walk(node.right, depth + 1, node.id);
  };
  walk(snap.root, 0, null);
  return out;
}

interface Marks {
  trail: Set<string>;
  output: string[];
  found: string | null;
}

function marksFor(steps: readonly Step<Frame>[], index: number): Marks {
  const trail = new Set<string>();
  const output: string[] = [];
  let found: string | null = null;
  for (let i = 0; i <= index && i < steps.length; i++) {
    const s = steps[i];
    const id = s.focus?.[0];
    if (typeof id !== 'string') continue;
    if (s.kind === 'compare' || s.kind === 'successor') trail.add(id);
    else if (s.kind === 'visit') {
      if (s.snapshot.op === 'traverse') output.push(id);
      else trail.add(id);
    } else if (s.kind === 'collect') output.push(id);
    else if (s.kind === 'found') {
      found = id;
      trail.add(id);
    }
  }
  return { trail, output, found };
}

function TreeView({ snap, focus, marks }: { snap: TSnap; focus: Set<string | number>; marks: Marks }) {
  const placed = useMemo(() => layoutTree(snap), [snap]);
  const pos = new Map(placed.map((p) => [p.node.id, { x: PAD + p.x * XGAP, y: PAD + p.y * YGAP }]));
  const depth = placed.reduce((m, p) => Math.max(m, p.y), 0);
  const width = Math.max(320, PAD * 2 + Math.max(0, placed.length - 1) * XGAP);
  const height = PAD * 2 + depth * YGAP + 18;
  const order = new Map(marks.output.map((id, i) => [id, i + 1]));
  const scroller = useRef<HTMLDivElement>(null);
  const focusId = [...focus].find((f): f is string => typeof f === 'string' && pos.has(f));
  const fx = focusId ? (pos.get(focusId)?.x ?? null) : null;
  const fy = focusId ? (pos.get(focusId)?.y ?? null) : null;

  // keep the node being worked on in view inside the tree viewport (wide or degenerate trees scroll both ways)
  useEffect(() => {
    const el = scroller.current;
    if (!el || fx === null || fy === null) return;
    const offset = Math.max(0, (el.clientWidth - width) / 2);
    el.scrollTo({ left: Math.max(0, fx + offset - el.clientWidth / 2), top: Math.max(0, fy - el.clientHeight / 2), behavior: 'smooth' });
  }, [fx, fy, width]);

  if (!placed.length) return <EmptyState>root = NULL. Insert districts to grow the tree.</EmptyState>;
  return (
    <div ref={scroller} data-lenis-prevent className="scrollbar-thin -mx-1 max-h-[34rem] overflow-auto overscroll-contain px-1 pb-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto block" role="img" aria-label={`Binary search tree with ${placed.length} nodes, height ${depth + 1}`}>
        {placed.map((p) => {
          if (p.parent === null) return null;
          const a = pos.get(p.parent);
          const b = pos.get(p.node.id);
          if (!a || !b) return null;
          const on = marks.trail.has(p.parent) && (marks.trail.has(p.node.id) || focus.has(p.node.id));
          return (
            <motion.line
              key={`e-${p.node.id}`}
              initial={false}
              animate={{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }}
              transition={{ duration: 0.6, ease }}
              stroke={on ? '#ffffff' : 'rgba(236,240,241,0.22)'}
              strokeWidth={on ? 2.4 : 1.2}
            />
          );
        })}
        {placed.map((p) => {
          const at = pos.get(p.node.id) ?? { x: 0, y: 0 };
          const t = p.node.key.t;
          const on = focus.has(p.node.id);
          const inTrail = marks.trail.has(p.node.id);
          const rank = order.get(p.node.id);
          const hit = marks.found === p.node.id;
          return (
            <motion.g key={p.node.id} initial={{ x: at.x, y: at.y - 26, opacity: 0 }} animate={{ x: at.x, y: at.y, opacity: 1 }} transition={{ duration: 0.6, ease }}>
              <title>{`${p.node.id}: ${DISTRICTS[p.node.value].name} · ${t.toFixed(1)} °C`}</title>
              {(on || hit) && <circle r={R + 7} fill="none" stroke="#ecf0f1" strokeOpacity={0.35} strokeWidth={6} />}
              <circle r={R} fill={heatHex(t)} stroke={on || hit ? '#ffffff' : inTrail ? '#ecf0f1' : 'rgba(26,37,49,0.8)'} strokeWidth={on || hit ? 3 : inTrail ? 2 : 1.2} />
              <text y={3.5} textAnchor="middle" fontSize="10" fontWeight={600} className="font-mono" fill={isLightHeat(t) ? '#2c3d50' : '#ecf0f1'}>
                {t.toFixed(1)}
              </text>
              <text y={R + 12} textAnchor="middle" fontSize="8.5" className="font-mono" fill={on || inTrail ? '#ecf0f1' : '#8a96a1'}>
                {shortName(p.node.value, 8)}
              </text>
              {rank !== undefined && (
                <g transform={`translate(${R - 2}, ${-R + 2})`}>
                  <circle r={8} fill="#ecf0f1" stroke="#1a2531" strokeWidth={1.5} />
                  <text y={3} textAnchor="middle" fontSize="8.5" fontWeight={700} className="font-mono" fill="#2c3d50">
                    {rank}
                  </text>
                </g>
              )}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}

type InsertOrder = 'balanced' | 'alpha' | 'hottest';

/** Median-first order over the sorted keys: every subtree gets its median as root, so the height is ⌈log₂(n + 1)⌉. */
function balancedOrder(ids: number[], key: (id: number) => HeatKey): number[] {
  const sorted = [...ids].sort((a, b) => compareHeat(key(a), key(b)));
  const out: number[] = [];
  const rec = (lo: number, hi: number) => {
    if (lo > hi) return;
    const mid = (lo + hi) >> 1;
    out.push(sorted[mid]);
    rec(lo, mid - 1);
    rec(mid + 1, hi);
  };
  rec(0, sorted.length - 1);
  return out;
}

const ORDER_LABEL: Record<InsertOrder, string> = { balanced: 'median first (balanced)', alpha: 'alphabetical', hottest: 'hottest first (degenerate)' };

export function Exp5HotspotIndex({ model, meta, source }: ExpProps) {
  const ds = useRef<BST<HeatKey, number> | null>(null);
  const get = () => (ds.current ??= create());
  const lab = useLab<Frame>(() => ({ tree: create().snapshot(), op: 'insert' }));
  const [district, setDistrict] = useState(model.intel.ranking[0]);
  const [order, setOrder] = useState<InsertOrder>('balanced');
  const [lastDelete, setLastDelete] = useState<{ name: string; kase: BSTDeleteCase } | null>(null);

  const temps = model.rows.map((r) => r.tmax);
  const tMin = Math.floor(Math.min(...temps));
  const tMax = Math.ceil(Math.max(...temps));
  const [lo, setLo] = useState(Math.max(tMin, 40));
  const [hi, setHi] = useState(tMax);

  const keyOf = (id: number): HeatKey => ({ t: model.rows[id].tmax, id });
  const present = new Set(lab.base.tree.nodes.map((n) => n.value));
  const wrap = (op: Op5) => (tree: TSnap): Frame => ({ tree, op });

  const insert = (id: number) => {
    const t = get().insert(keyOf(id), id);
    lab.commit({
      op: 'insert',
      detail: t.result.ok ? `${describeKey(keyOf(id))} inserted as ${t.result.id}.` : `${DISTRICTS[id].name} is already in the tree (duplicate key).`,
      tone: t.result.ok ? 'ok' : 'warn',
      steps: mapSteps(t.steps, wrap('insert')),
    });
  };

  const insertAll = () => {
    const tree = get();
    const all = model.rows.map((r) => r.id);
    const ids = order === 'balanced' ? balancedOrder(all, keyOf) : order === 'alpha' ? [...DISTRICTS_BY_NAME].map((d) => d.id) : [...model.intel.ranking];
    const steps: Step<TSnap>[] = [];
    let added = 0;
    for (const id of ids) {
      if (present.has(id)) continue;
      steps.push(...tree.insert(keyOf(id), id).steps);
      added++;
    }
    if (!added) return;
    lab.commit({
      op: 'insert',
      detail: `Inserted ${added} district${added === 1 ? '' : 's'} in ${ORDER_LABEL[order]} order; height is now ${tree.height()}.`,
      tone: 'ok',
      steps: mapSteps(steps, wrap('insert')),
    });
  };

  const search = (id: number) => {
    const t = get().search(keyOf(id));
    lab.commit({
      op: 'search',
      detail: t.result.found ? `Found ${DISTRICTS[id].name} after visiting ${t.result.path.length} node(s).` : `${DISTRICTS[id].name} is not in the tree (${t.result.path.length} node(s) visited).`,
      tone: t.result.found ? 'ok' : 'warn',
      steps: mapSteps(t.steps, wrap('search')),
    });
  };

  const remove = (id: number) => {
    const t = get().delete(keyOf(id));
    const r = t.result;
    if (r.ok) setLastDelete({ name: DISTRICTS[id].name, kase: r.case });
    lab.commit({
      op: 'delete',
      detail: r.ok ? `Deleted ${DISTRICTS[id].name}: case ${r.case}${r.replacementId ? `, ${r.replacementId} takes its place` : ''}.` : `${DISTRICTS[id].name} is not in the tree.`,
      tone: r.ok ? 'ok' : 'warn',
      steps: mapSteps(t.steps, wrap('delete')),
    });
  };

  const traverse = (kind: 'inorder' | 'reverseInorder' | 'preorder') => {
    const tree = get();
    const t = kind === 'inorder' ? tree.inorder() : kind === 'reverseInorder' ? tree.reverseInorder() : tree.preorder();
    const names = t.result.slice(0, 3).map((e) => DISTRICTS[e.value].name);
    lab.commit({
      op: kind,
      detail: t.result.length ? `${t.result.length} nodes: ${names.join(', ')}${t.result.length > 3 ? ', …' : ''}` : 'The tree is empty.',
      tone: 'ok',
      steps: mapSteps(t.steps, wrap('traverse')),
    });
  };

  const range = () => {
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    const t = get().rangeQuery({ t: a, id: -1 }, { t: b, id: Number.MAX_SAFE_INTEGER });
    lab.commit({
      op: 'rangeQuery',
      detail: `${t.result.length} district(s) between ${a.toFixed(1)} and ${b.toFixed(1)} °C.`,
      tone: 'ok',
      steps: mapSteps(t.steps, wrap('range')),
    });
  };

  const reset = () => {
    ds.current = create();
    setLastDelete(null);
    lab.reset({ tree: ds.current.snapshot(), op: 'insert' }, 'Tree cleared: root = NULL.');
  };

  const frame = lab.frame;
  const step = lab.player.step;
  const focus = new Set<string | number>(step?.focus ?? []);
  const marks = marksFor(lab.player.steps, lab.player.index);
  const placed = layoutTree(frame.tree);
  const height = placed.reduce((m, p) => Math.max(m, p.y + 1), 0);
  const rootNode = frame.tree.nodes[0];
  const status = step ? { label: step.kind === 'delete' && lastDelete ? `Delete · ${lastDelete.kase}` : step.kind, tone: stepTone(step.kind) } : null;
  const outputTitle = frame.op === 'range' ? 'rangeQuery() result, ascending' : lab.activeOp === 'reverseInorder' ? 'Reverse in-order = hotspot ranking' : lab.activeOp === 'preorder' ? 'Preorder output' : 'In-order output';
  const byId = new Map(frame.tree.nodes.map((n) => [n.id, n]));

  const controls = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <OpGroup op="insert / search / delete" complexity="O(h)" hint="Key = (Tmax, district id), so ties never collide.">
        <DistrictSelect value={district} onChange={setDistrict} rows={model.rows} className="w-full" label="Key district" />
        <button type="button" onClick={() => insert(district)} className={buttonClass('primary', 'sm')}>
          <Plus className="size-4" aria-hidden /> Insert
        </button>
        <button type="button" onClick={() => search(district)} className={buttonClass('secondary', 'sm')}>
          <Search className="size-4" aria-hidden /> Search
        </button>
        <button type="button" onClick={() => remove(district)} className={buttonClass('secondary', 'sm')}>
          <Trash2 className="size-4" aria-hidden /> Delete
        </button>
      </OpGroup>
      <OpGroup op="insert all · traversals" complexity="O(n)" hint={`${present.size} of 36 districts in the tree.`}>
        <SelectField label="Insert order" value={order} onChange={(e) => setOrder(e.target.value as InsertOrder)} className="w-full">
          {(Object.keys(ORDER_LABEL) as InsertOrder[]).map((o) => (
            <option key={o} value={o}>
              Order: {ORDER_LABEL[o]}
            </option>
          ))}
        </SelectField>
        <button type="button" onClick={insertAll} disabled={present.size === 36} className={buttonClass('secondary', 'sm')}>
          <GitFork className="size-4" aria-hidden /> Insert all 36
        </button>
        <button type="button" onClick={() => traverse('inorder')} className={buttonClass('ghost', 'sm', 'px-3')}>
          <ArrowUpNarrowWide className="size-4" aria-hidden /> Inorder
        </button>
        <button type="button" onClick={() => traverse('reverseInorder')} className={buttonClass('ghost', 'sm', 'px-3')}>
          <ArrowDownWideNarrow className="size-4" aria-hidden /> Reverse
        </button>
        <button type="button" onClick={() => traverse('preorder')} className={buttonClass('ghost', 'sm', 'px-3')}>
          <ListTree className="size-4" aria-hidden /> Preorder
        </button>
      </OpGroup>
      <OpGroup op="rangeQuery" complexity="O(h + k)" hint={<>Every district with {Math.min(lo, hi).toFixed(1)} °C ≤ Tmax ≤ {Math.max(lo, hi).toFixed(1)} °C; subtrees outside the band are pruned.</>}>
        <div className="grid grid-cols-1 w-full gap-2">
          {(
            [
              ['From', lo, setLo],
              ['To', hi, setHi],
            ] as const
          ).map(([label, v, set]) => (
            <label key={label} className="flex items-center gap-3">
              <span className="w-9 font-mono text-[10.5px] uppercase text-fg-subtle">{label}</span>
              <input type="range" min={tMin} max={tMax} step={0.5} value={v} onChange={(e) => set(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-[#ecf0f1]" aria-label={`${label} temperature`} />
              <span className="w-14 text-right font-mono text-[12px] text-cloud tabular">{v.toFixed(1)}°</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={range} className={buttonClass('secondary', 'sm')}>
          <SlidersHorizontal className="size-4" aria-hidden /> Query band
        </button>
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={reset}>
      <StageCard
        title="struct Node { key; *left; *right; }"
        meta={
          <>
            <MetaTag>{frame.tree.nodes.length} nodes</MetaTag>
            <MetaTag>height {height}</MetaTag>
          </>
        }
        status={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <TreeView snap={frame.tree} focus={focus} marks={marks} />
        <p className="mt-3 font-mono text-[11px] text-fg-subtle">Left subtree cooler, right subtree hotter. Highlighted edges trace the path of the current operation; badges number the output order.</p>
      </StageCard>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Inspector title="Tree">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="nodes" value={frame.tree.nodes.length} />
            <Stat label="height" value={height} sub={frame.tree.nodes.length ? `log₂ n ≈ ${Math.log2(frame.tree.nodes.length).toFixed(1)}` : undefined} />
            <Stat label="root" value={rootNode ? `${rootNode.key.t.toFixed(1)}°` : 'NULL'} sub={rootNode ? DISTRICTS[rootNode.value].name : undefined} />
            <Stat label="last delete" value={lastDelete ? lastDelete.kase : '—'} sub={lastDelete?.name} />
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-fg-muted">
            Delete cases: <span className="text-cloud">leaf</span> is unlinked, <span className="text-cloud">one child</span> is spliced up,{' '}
            <span className="text-cloud">two children</span> is replaced by its in-order successor (leftmost node of the right subtree).
          </p>
        </Inspector>
        <Inspector title={outputTitle} aside={<span className="font-mono text-[10.5px] text-fg-subtle">{marks.output.length} out</span>}>
          {marks.output.length === 0 ? (
            <EmptyState>Run a traversal or a range query to read nodes out in order.</EmptyState>
          ) : (
            <ol className="flex flex-wrap gap-1.5">
              {marks.output.map((id, i) => {
                const n = byId.get(id);
                if (!n) return null;
                return (
                  <motion.li
                    key={id}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn('inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-fg-muted', i === marks.output.length - 1 && 'border-cloud text-cloud')}
                  >
                    <span className="font-mono text-[10px] text-fg-subtle">{i + 1}</span>
                    {shortName(n.value, 14)}
                    <span className="font-mono text-[10.5px] text-cloud tabular">{n.key.t.toFixed(1)}</span>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </Inspector>
      </div>
    </Workspace>
  );
}
