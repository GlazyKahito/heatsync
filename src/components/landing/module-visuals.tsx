'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Eight small looping diagrams, one per data structure, drawn with real district names and values from the
 * 26 May 2024 replay. Purely illustrative motion — the working structures live in the console and the lab.
 */

const ease = [0.16, 1, 0.3, 1] as const;

function useTick(ms: number, n: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => window.clearInterval(id);
  }, [ms, n]);
  return i;
}

type Tone = 'light' | 'dark';
const ink = (t: Tone) => (t === 'light' ? 'text-midnight' : 'text-cloud');
const cell = (t: Tone) => (t === 'light' ? 'border-midnight/20 bg-midnight/[0.06]' : 'border-white/15 bg-white/[0.05]');

// 1 — array of structures
const STATIONS = ['NGP 45.8', 'AKL 45.0', 'AMR 44.3', 'PBN 43.5', 'NED 43.3', 'YTL 43.2'];
export function ArrayVisual({ tone }: { tone: Tone }) {
  const i = useTick(1100, STATIONS.length + 3);
  const size = Math.min(i, STATIONS.length);
  return (
    <div className={cn('font-mono text-[10px]', ink(tone))}>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: 8 }, (_, k) => (
          <div key={k} className={cn('relative grid h-12 place-items-center rounded-md border', cell(tone))}>
            <AnimatePresence>
              {k < size && (
                <motion.span
                  key={STATIONS[k]}
                  initial={{ y: -16, opacity: 0, scale: 0.8 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.5, ease }}
                  className="text-center leading-tight"
                >
                  {STATIONS[k].split(' ')[0]}
                  <br />
                  <span className="opacity-60">{STATIONS[k].split(' ')[1]}</span>
                </motion.span>
              )}
            </AnimatePresence>
            <span className="absolute -bottom-4 opacity-40">{k}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 opacity-60">insertLast → slot [{size}] · size {size}/8</p>
    </div>
  );
}

// 2 — singly linked list
const BULLETINS = ['#14 NGP HW', '#13 AKL HW', '#12 AMR WATCH', '#11 PBN WATCH', '#10 NED WATCH'];
export function ListVisual({ tone }: { tone: Tone }) {
  const i = useTick(1600, 3);
  const visible = BULLETINS.slice(2 - i, 5 - i + 2).slice(0, 4);
  return (
    <div className={cn('flex items-center gap-1.5 overflow-hidden font-mono text-[10px]', ink(tone))}>
      <span className="shrink-0 opacity-60">head →</span>
      <AnimatePresence mode="popLayout" initial={false}>
        {visible.map((b) => (
          <motion.div
            key={b}
            layout
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease }}
            className="flex shrink-0 items-center gap-1.5"
          >
            <div className={cn('rounded-md border px-2 py-2 leading-tight', cell(tone))}>
              {b.split(' ')[0]}
              <br />
              <span className="opacity-60">
                {b.split(' ')[1]} {b.split(' ')[2]}
              </span>
            </div>
            <span className="opacity-50">→</span>
          </motion.div>
        ))}
      </AnimatePresence>
      <span className="shrink-0 opacity-40">null</span>
    </div>
  );
}

// 3 — stack: infix → postfix
const POSTFIX = ['tmax', '40', '>=', 'dep', '4.5', '>=', '&&'];
const STACK_STATES: string[][] = [[], [], ['>='], ['>='], [], ['&&'], ['&&', '>='], ['&&', '>='], []];
export function StackVisual({ tone }: { tone: Tone }) {
  const i = useTick(900, POSTFIX.length + 3);
  const out = POSTFIX.slice(0, Math.min(i, POSTFIX.length));
  const stack = STACK_STATES[Math.min(i, STACK_STATES.length - 1)];
  return (
    <div className={cn('grid grid-cols-[auto_1fr] items-end gap-4 font-mono text-[10px]', ink(tone))}>
      <div className={cn('flex h-28 w-16 flex-col-reverse gap-1 rounded-lg border border-t-0 p-1', tone === 'light' ? 'border-midnight/25' : 'border-white/20')}>
        <AnimatePresence>
          {stack.map((s, k) => (
            <motion.div
              key={`${s}-${k}`}
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.4, ease }}
              className={cn('rounded border py-1 text-center', cell(tone))}
            >
              {s}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div>
        <p className="mb-2 opacity-60">tmax &gt;= 40 &amp;&amp; dep &gt;= 4.5</p>
        <div className="flex flex-wrap gap-1">
          {out.map((t, k) => (
            <motion.span key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded border px-1.5 py-1', cell(tone))}>
              {t}
            </motion.span>
          ))}
        </div>
        <p className="mt-2 opacity-60">postfix</p>
      </div>
    </div>
  );
}

// 4 — circular queue
export function RingVisual({ tone }: { tone: Tone }) {
  const N = 12;
  const i = useTick(700, 1000);
  const rear = i % N;
  const count = Math.min(i + 1, N);
  const front = (rear - count + 1 + N) % N;
  return (
    <div className={cn('flex items-center gap-5 font-mono text-[10px]', ink(tone))}>
      <svg viewBox="0 0 120 120" className="size-28 shrink-0">
        {Array.from({ length: N }, (_, k) => {
          const a0 = (k / N) * Math.PI * 2 - Math.PI / 2 + 0.03;
          const a1 = ((k + 1) / N) * Math.PI * 2 - Math.PI / 2 - 0.03;
          const filled = (k - front + N) % N < count;
          const r0 = 38, r1 = 54;
          const p = (r: number, a: number) => `${(60 + r * Math.cos(a)).toFixed(2)},${(60 + r * Math.sin(a)).toFixed(2)}`;
          return (
            <path
              key={k}
              d={`M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)}Z`}
              fill="currentColor"
              fillOpacity={k === rear ? 0.95 : filled ? 0.35 : 0.08}
              className="transition-[fill-opacity] duration-500"
            />
          );
        })}
        <text x="60" y="58" textAnchor="middle" fill="currentColor" fontSize="9" opacity="0.6">
          rear
        </text>
        <text x="60" y="70" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="700">
          {rear}
        </text>
      </svg>
      <div className="space-y-1 opacity-80">
        <p>rear = (rear + 1) % 12</p>
        <p>front = {front}</p>
        <p>count = {count}</p>
        <p className="opacity-60">full → overwrite oldest</p>
      </div>
    </div>
  );
}

// 5 — BST (search path)
const TREE: { k: string; x: number; y: number; p?: number }[] = [
  { k: '43.2', x: 50, y: 12 },
  { k: '42.5', x: 26, y: 40, p: 0 },
  { k: '44.3', x: 74, y: 40, p: 0 },
  { k: '41.4', x: 13, y: 68, p: 1 },
  { k: '42.9', x: 38, y: 68, p: 1 },
  { k: '43.5', x: 62, y: 68, p: 2 },
  { k: '45.8', x: 87, y: 68, p: 2 },
];
const PATH = [0, 2, 6];
export function TreeVisual({ tone }: { tone: Tone }) {
  const i = useTick(800, PATH.length + 3);
  const lit = new Set(PATH.slice(0, Math.min(i + 1, PATH.length)));
  return (
    <div className={cn('font-mono text-[10px]', ink(tone))}>
      <svg viewBox="0 0 100 80" className="h-32 w-full overflow-visible">
        {TREE.map((n, k) =>
          n.p === undefined ? null : (
            <line key={`l${k}`} x1={TREE[n.p].x} y1={TREE[n.p].y} x2={n.x} y2={n.y} stroke="currentColor" strokeOpacity={lit.has(k) && lit.has(n.p) ? 0.9 : 0.25} strokeWidth={0.6} />
          ),
        )}
        {TREE.map((n, k) => (
          <g key={k}>
            <circle cx={n.x} cy={n.y} r={7} fill="currentColor" fillOpacity={lit.has(k) ? 0.95 : 0.12} className="transition-[fill-opacity] duration-300" />
            <text x={n.x} y={n.y + 2} textAnchor="middle" fontSize={4.6} fontWeight={700} className={lit.has(k) ? (tone === 'light' ? 'fill-cloud' : 'fill-midnight') : 'fill-current'}>
              {n.k}
            </text>
          </g>
        ))}
      </svg>
      <p className="opacity-60">search 45.8 → right, right · reverse in-order = hottest first</p>
    </div>
  );
}

// 6 — BFS on a tiny graph
const G = {
  nodes: [
    [50, 50], [26, 30], [74, 28], [22, 68], [78, 70], [50, 14], [50, 86], [8, 48], [92, 48],
  ] as [number, number][],
  level: [0, 1, 1, 1, 1, 2, 2, 2, 2],
  edges: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 5], [3, 6], [4, 6], [1, 7], [3, 7], [2, 8], [4, 8]] as [number, number][],
};
export function GraphVisual({ tone }: { tone: Tone }) {
  const i = useTick(750, 5);
  return (
    <div className={cn('font-mono text-[10px]', ink(tone))}>
      <svg viewBox="0 0 100 100" className="mx-auto h-36 w-full">
        {G.edges.map(([a, b], k) => {
          const on = Math.max(G.level[a], G.level[b]) <= i - 1;
          return <line key={k} x1={G.nodes[a][0]} y1={G.nodes[a][1]} x2={G.nodes[b][0]} y2={G.nodes[b][1]} stroke="currentColor" strokeOpacity={on ? 0.85 : 0.18} strokeWidth={on ? 1 : 0.6} className="transition-all duration-500" />;
        })}
        {G.nodes.map(([x, y], k) => {
          const on = G.level[k] <= i - 1;
          const front = G.level[k] === i - 1;
          return (
            <g key={k}>
              {front && <circle cx={x} cy={y} r={9} fill="currentColor" fillOpacity={0.15} />}
              <circle cx={x} cy={y} r={k === 0 ? 5 : 3.6} fill="currentColor" fillOpacity={on ? 1 : 0.2} className="transition-all duration-500" />
            </g>
          );
        })}
      </svg>
      <p className="text-center opacity-60">level {Math.max(0, i - 1)} · queue → visit → enqueue neighbours</p>
    </div>
  );
}

// 7 — sort + binary search
// eleven of Nagpur's May 2024 daily maxima, sorted
const BARS = [34.4, 37.3, 38.8, 40.0, 40.6, 41.4, 41.9, 42.7, 43.6, 44.2, 45.8];
const STEPS = [
  [0, 5, 10],
  [6, 8, 10],
  [9, 9, 10],
];
export function SearchVisual({ tone }: { tone: Tone }) {
  const i = useTick(1000, STEPS.length + 2);
  const [lo, mid, hi] = STEPS[Math.min(i, STEPS.length - 1)];
  return (
    <div className={cn('font-mono text-[10px]', ink(tone))}>
      <div className="flex h-28 items-end gap-1">
        {BARS.map((b, k) => (
          <div key={k} className="flex flex-1 flex-col items-center gap-1">
            <motion.div
              className="w-full rounded-t-sm bg-current"
              animate={{ opacity: k === mid ? 1 : k >= lo && k <= hi ? 0.45 : 0.12 }}
              style={{ height: `${(b - 34) * 8}px` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 opacity-60">
        lo {lo} · mid {mid} · hi {hi} → find 44.2 in O(log n)
      </p>
    </div>
  );
}

// 8 — hash table with linear probing
const SLOTS = 11;
// real values of h(key) = (h·31 + c) mod 11 — pune/wardha and akola/latur collide
const KEYS = [
  { k: 'nagpur', h: 0 },
  { k: 'pune', h: 3 },
  { k: 'wardha', h: 3 },
  { k: 'akola', h: 9 },
  { k: 'latur', h: 9 },
];
export function HashVisual({ tone }: { tone: Tone }) {
  const i = useTick(1100, KEYS.length + 2);
  const table: (string | null)[] = Array(SLOTS).fill(null);
  let probe: number[] = [];
  KEYS.slice(0, Math.min(i + 1, KEYS.length)).forEach(({ k, h }, idx) => {
    let s = h;
    const path = [s];
    while (table[s]) {
      s = (s + 1) % SLOTS;
      path.push(s);
    }
    table[s] = k;
    if (idx === Math.min(i, KEYS.length - 1)) probe = path;
  });
  return (
    <div className={cn('font-mono text-[10px]', ink(tone))}>
      <div className="grid grid-cols-11 gap-1">
        {table.map((v, k) => (
          <div key={k} className={cn('relative grid h-14 place-items-center rounded-md border transition-colors duration-300', cell(tone), probe.includes(k) && (tone === 'light' ? 'border-midnight/60' : 'border-cloud/70'))}>
            <span className="rotate-[-90deg] whitespace-nowrap text-[9px]">{v ?? ''}</span>
            <span className="absolute -bottom-4 opacity-40">{k}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 opacity-60">h = (h·31 + c) mod 11 · collision → (h + i) mod 11</p>
    </div>
  );
}
