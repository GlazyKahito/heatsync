'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { BookPlus, CornerDownRight, Plus, Search, Trash2 } from 'lucide-react';
import { HashTable, normalizeKey, polyHash, type HashProbe, type HashSnapshot } from '@/lib/ds/hash-table';
import type { Step } from '@/lib/ds/trace';
import { DISTRICTS } from '@/lib/data';
import { stationCode } from '@/lib/engine';
import { buttonClass, LevelChip } from '@/components/ui/primitives';
import { cn, fmtC } from '@/lib/utils';
import { shortName, stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { EmptyState, Inspector, inputClass, MetaTag, OpGroup, Stat, StageCard, StatusBadge } from '../ui';

type Snap = HashSnapshot<number>;
type KeyKind = 'name' | 'former name' | 'HQ PIN';
interface KeyEntry {
  key: string;
  id: number;
  kind: KeyKind;
}

const CAP = 13;
const DIRECTORY_CAP = 211;
const CATALOG: KeyEntry[] = DISTRICTS.flatMap((d) => [
  { key: d.name, id: d.id, kind: 'name' as const },
  ...d.aliases.map((a) => ({ key: a, id: d.id, kind: 'former name' as const })),
  { key: d.hqPin, id: d.id, kind: 'HQ PIN' as const },
]);
const BY_KEY = new Map(CATALOG.map((e) => [normalizeKey(e.key), e]));
/** Chosen so the 13-slot table shows collisions, a tombstone-free cluster and (with Washim) a wrap-around. */
const SAMPLE = ['Nagpur', '440001', 'Pune', 'Poona', 'Aurangabad', 'Bombay', 'Chhatrapati Sambhajinagar', 'Mumbai', 'Alibag'];

let directory: HashTable<number> | null = null;
/** Production-sized dictionary with every name, former name and HQ PIN (95 keys, load ≈ 0.45). */
function getDirectory(): HashTable<number> {
  if (directory) return directory;
  const t = new HashTable<number>(DIRECTORY_CAP, { maxSteps: 0 });
  for (const e of CATALOG) t.insert(e.key, e.id);
  t.maxSteps = 64;
  directory = t;
  return t;
}

const create = () => new HashTable<number>(CAP);

/** h = (h * 31 + c) mod cap, one row per character. */
function hashTrail(key: string, cap: number) {
  const out: { ch: string; code: number; h: number }[] = [];
  let h = 0;
  for (const ch of key) {
    const code = ch.charCodeAt(0);
    h = (h * 31 + code) % cap;
    out.push({ ch, code, h });
  }
  return out;
}

/** Probes of the key being processed at step `index` (a 'hash' step starts a new key) and its home slot. */
function probeState(steps: readonly Step<Snap>[], index: number): { probes: HashProbe[]; home: number | null } {
  let probes: HashProbe[] = [];
  let home: number | null = null;
  for (let i = 0; i <= index && i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === 'hash') {
      probes = [];
      home = typeof s.focus?.[0] === 'number' ? s.focus[0] : null;
    }
    const p = s.snapshot.probe;
    const last = probes[probes.length - 1];
    if (p && (!last || last.attempt !== p.attempt || last.slot !== p.slot)) probes.push(p);
  }
  return { probes, home };
}

const pos = (i: number, r: number) => {
  const a = (i / CAP) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
};

function SlotRing({ snap, focus, probes, home, kind }: { snap: Snap; focus: Set<number | string>; probes: HashProbe[]; home: number | null; kind?: string }) {
  const arcs = probes.slice(1).map((p, k) => ({ from: probes[k].slot, to: p.slot }));
  const used = snap.slots.filter((s) => s.state === 'occupied').length;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[32rem]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="38.5" fill="none" stroke="rgba(236,240,241,0.07)" strokeWidth="0.4" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="rgba(236,240,241,0.05)" strokeWidth="0.3" strokeDasharray="0.8 1.2" />
        {arcs.map((a, k) => {
          const p0 = pos(a.from, 27);
          const p1 = pos(a.to, 27);
          return (
            <motion.path
              key={`${k}-${a.from}-${a.to}`}
              d={`M${p0.x} ${p0.y} A27 27 0 0 1 ${p1.x} ${p1.y}`}
              fill="none"
              stroke="#ecf0f1"
              strokeWidth="0.9"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.35 }}
            />
          );
        })}
      </svg>
      {snap.slots.map((s, i) => {
        const p = pos(i, 38.5);
        const on = focus.has(i);
        const hit = on && (kind === 'found' || kind === 'insert' || kind === 'update');
        const entry = s.key ? BY_KEY.get(s.key) : undefined;
        return (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <div
              className={cn(
                'relative flex w-[3.9rem] flex-col items-center rounded-xl border px-1 py-1.5 text-center transition-[border-color,background-color,box-shadow,transform] duration-300 min-[420px]:w-[4.8rem] sm:w-[5.6rem] sm:rounded-2xl sm:py-2',
                s.state === 'occupied' && 'border-line-strong bg-night/95',
                s.state === 'empty' && 'border-dashed border-line bg-abyss/80',
                s.state === 'deleted' && 'border-dashed border-silver/40 bg-[repeating-linear-gradient(135deg,rgba(189,195,199,0.10)_0_4px,transparent_4px_8px)]',
                on && 'scale-105 border-cloud shadow-[0_0_0_4px_rgba(236,240,241,0.14)]',
                hit && 'bg-cloud text-midnight',
              )}
            >
              {home === i && (
                <span className="absolute -top-2 right-1 rounded-full bg-silver px-1.5 font-mono text-[8px] font-semibold uppercase text-midnight">h(k)</span>
              )}
              <span className={cn('font-mono text-[9px]', hit ? 'text-midnight/60' : 'text-fg-subtle')}>[{i}]</span>
              {s.state === 'occupied' ? (
                <>
                  <span className={cn('w-full truncate font-mono text-[9.5px] sm:text-[11px]', hit ? 'text-midnight' : 'text-cloud')} title={s.key}>
                    {s.key}
                  </span>
                  <span className={cn('hidden w-full truncate text-[9.5px] min-[420px]:block', hit ? 'text-midnight/70' : 'text-fg-subtle')}>
                    → {entry ? shortName(entry.id, 10) : `#${s.value}`}
                  </span>
                </>
              ) : (
                <span className="font-mono text-[9.5px] text-fg-subtle">{s.state === 'deleted' ? 'tombstone' : 'empty'}</span>
              )}
            </div>
          </div>
        );
      })}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="max-w-[40%] text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-fg-subtle">load factor</p>
          <p className="font-wide text-2xl font-black tracking-[-0.03em] text-cloud tabular sm:text-3xl">{(used / CAP).toFixed(2)}</p>
          <p className="font-mono text-[9.5px] text-fg-muted">
            {used}/{CAP} · probe (h + i) % {CAP}
          </p>
        </div>
      </div>
    </div>
  );
}

function statusOf(step: Step<Snap> | null) {
  if (!step) return null;
  const p = step.snapshot.probe;
  const labels: Record<string, string> = { hash: `h(k) = ${step.focus?.[0] ?? ''}`, probe: p ? `probe i = ${p.attempt}` : 'probe', delete: 'tombstone', insert: 'stored', update: 'updated' };
  return { label: labels[step.kind] ?? step.kind, tone: stepTone(step.kind) };
}

export function Exp8InstantLookup({ model, meta, source }: ExpProps) {
  const ds = useRef<HashTable<number> | null>(null);
  const get = () => (ds.current ??= create());
  const lab = useLab<Snap>(() => create().snapshot());
  const [keyText, setKeyText] = useState('Aurangabad');
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [lookup, setLookup] = useState('440001');

  const norm = normalizeKey(keyText);
  const known = BY_KEY.get(norm) ?? null;
  // counts follow the frame on screen, so they match the ring while a step replays
  const tombs = lab.frame.slots.filter((s) => s.state === 'deleted').length;
  const size = lab.frame.slots.filter((s) => s.state === 'occupied').length;

  const insert = (key: string) => {
    const e = BY_KEY.get(normalizeKey(key));
    if (!e) return;
    setLastKey(normalizeKey(key));
    const t = get().insert(e.key, e.id);
    const r = t.result;
    lab.commit({
      op: 'insert',
      detail: r.ok ? `"${normalizeKey(key)}" → ${DISTRICTS[e.id].name} ${r.action} at slot ${r.slot} after ${r.probes} probe(s).` : r.reason === 'full' ? `Table full: all ${CAP} slots probed.` : 'Empty key.',
      tone: r.ok ? 'ok' : 'error',
      steps: t.steps,
    });
  };

  const insertSample = () => {
    const table = get();
    const steps: Step<Snap>[] = [];
    const added: string[] = [];
    for (const k of SAMPLE) {
      if (table.has(k)) continue;
      const e = BY_KEY.get(normalizeKey(k));
      if (!e) continue;
      const t = table.insert(e.key, e.id);
      if (!t.result.ok) {
        steps.push(...t.steps);
        break;
      }
      steps.push(...t.steps);
      added.push(k);
    }
    if (!steps.length) return;
    setLastKey(added.length ? normalizeKey(added[added.length - 1]) : null);
    lab.commit({ op: 'insert', detail: added.length ? `Inserted ${added.length} keys: ${added.join(', ')}.` : 'No room for the sample set.', tone: added.length ? 'ok' : 'error', steps });
  };

  const search = (key: string) => {
    if (!normalizeKey(key)) return;
    setLastKey(normalizeKey(key));
    const t = get().search(key);
    const r = t.result;
    lab.commit({
      op: 'search',
      detail: r.found && r.value !== undefined ? `"${normalizeKey(key)}" → ${DISTRICTS[r.value].name} (slot ${r.slot}, ${r.probes} probe(s)).` : `"${normalizeKey(key)}" not found after ${r.probes} probe(s).`,
      tone: r.found ? 'ok' : 'warn',
      steps: t.steps,
    });
  };

  const remove = (key: string) => {
    if (!normalizeKey(key)) return;
    setLastKey(normalizeKey(key));
    const t = get().delete(key);
    const r = t.result;
    lab.commit({
      op: 'delete',
      detail: r.ok ? `"${normalizeKey(key)}" removed: slot ${r.slot} is now a tombstone.` : `"${normalizeKey(key)}" is not in the table.`,
      tone: r.ok ? 'ok' : 'warn',
      steps: t.steps,
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    search(keyText);
  };

  const reset = () => {
    ds.current = create();
    setLastKey(null);
    lab.reset(ds.current.snapshot(), `Table cleared: ${CAP} empty slots.`);
  };

  const resolved = useMemo(() => {
    const q = normalizeKey(lookup);
    if (!q) return null;
    const t = getDirectory().search(q);
    const probes = t.steps.flatMap((s) => (s.snapshot.probe ? [s.snapshot.probe.slot] : []));
    return { q, ...t.result, entry: BY_KEY.get(q) ?? null, home: getDirectory().hash(q), probeSlots: probes };
  }, [lookup]);

  const frame = lab.frame;
  const step = lab.player.step;
  const focus = new Set<number | string>(step?.focus ?? []);
  const { probes, home } = probeState(lab.player.steps, lab.player.index);
  const trailKey = lastKey ?? norm;
  const trail = trailKey ? hashTrail(trailKey, CAP) : [];
  const status = statusOf(step);

  const controls = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <OpGroup
        op="insert / search / delete"
        complexity="O(1) avg"
        hint={
          known ? (
            <>
              <span className="text-cloud">“{norm}”</span> is a {known.kind} of {DISTRICTS[known.id].name}; it hashes to slot {polyHash(norm, CAP)}.
            </>
          ) : norm ? (
            <>“{norm}” is not a district name, former name or HQ PIN: it can be searched but not inserted.</>
          ) : (
            'Type a district name, former name or HQ PIN.'
          )
        }
      >
        <form onSubmit={onSubmit} className="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
          <input value={keyText} onChange={(e) => setKeyText(e.target.value)} list="exp8-keys" spellCheck={false} placeholder="Aurangabad, 440001…" aria-label="Key" className={inputClass} />
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => insert(keyText)} disabled={!known} className={buttonClass('primary', 'sm', 'h-10')}>
              <Plus className="size-4" aria-hidden /> Insert
            </button>
            <button type="submit" disabled={!norm} className={buttonClass('secondary', 'sm', 'h-10')}>
              <Search className="size-4" aria-hidden /> Search
            </button>
            <button type="button" onClick={() => remove(keyText)} disabled={!norm} className={buttonClass('secondary', 'sm', 'h-10 px-3')} aria-label="Delete">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </form>
        <datalist id="exp8-keys">
          {CATALOG.map((e) => (
            <option key={`${e.kind}-${e.key}`} value={e.key}>
              {e.kind} · {DISTRICTS[e.id].name}
            </option>
          ))}
        </datalist>
        <div className="flex flex-wrap gap-1.5">
          {['Washim', 'Bombay', 'Nashik', 'Osmanabad'].map((k) => (
            <button key={k} type="button" onClick={() => setKeyText(k)} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-cloud">
              {k}
            </button>
          ))}
        </div>
      </OpGroup>
      <OpGroup op="sample set" hint={<>Nine keys picked to collide in 13 slots (Pune / Poona / Nashik, Aurangabad / Bombay). Then insert <span className="text-cloud">Washim</span> to watch the probe wrap past slot 12.</>}>
        <button type="button" onClick={insertSample} className={buttonClass('secondary', 'sm')}>
          <BookPlus className="size-4" aria-hidden /> Insert sample set
        </button>
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={reset}>
      <StageCard
        title={`struct Entry table[${CAP}] · circular array`}
        meta={
          <>
            <MetaTag>size {size}</MetaTag>
            <MetaTag>tombstones {tombs}</MetaTag>
          </>
        }
        status={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <div className="grid grid-cols-1 items-center gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
          <SlotRing snap={frame} focus={focus} probes={probes} home={home} kind={step?.kind} />
          <div className="min-w-0 space-y-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Probe sequence</p>
              {probes.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-fg-subtle">Run an operation to see each probe (h + i) % {CAP}.</p>
              ) : (
                <ol className="mt-2 space-y-1">
                  {probes.map((p) => (
                    <li key={p.attempt} className="flex items-center gap-2 font-mono text-[11.5px] text-fg-muted">
                      <span className="w-8 text-fg-subtle">i={p.attempt}</span>
                      <CornerDownRight className="size-3 text-fg-subtle" aria-hidden />
                      <span className="shrink-0 whitespace-nowrap text-cloud">slot {p.slot}</span>
                      <span className="truncate">{p.state === 'occupied' ? `“${p.key}”` : p.state === 'deleted' ? 'tombstone' : 'empty'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="load factor" value={(size / CAP).toFixed(2)} sub={size / CAP > 0.7 ? 'high: long probe chains' : 'occupied / capacity'} />
              <Stat label="probes" value={probes.length} sub="this operation" />
            </div>
          </div>
        </div>
      </StageCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Inspector title={trailKey ? `Rolling hash of “${trailKey}”` : 'Rolling hash'}>
          {trail.length === 0 ? (
            <EmptyState>Type a key to see h = (h × 31 + c) mod {CAP}, character by character.</EmptyState>
          ) : (
            <>
              <ol className="flex flex-wrap gap-1.5">
                {trail.map((r, i) => (
                  <li key={i} className="flex flex-col items-center rounded-xl border border-line bg-white/[0.03] px-2 py-1.5 font-mono">
                    <span className="text-[12px] text-cloud">{r.ch === ' ' ? '␠' : r.ch}</span>
                    <span className="text-[9px] text-fg-subtle">{r.code}</span>
                    <span className="text-[10.5px] text-fg-muted">{r.h}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 font-mono text-[11.5px] text-fg-muted">
                home slot = <span className="text-cloud">{trail[trail.length - 1].h}</span> (top: character, middle: code, bottom: h so far)
              </p>
            </>
          )}
        </Inspector>
        <Inspector title={`Resolve · full directory (${DIRECTORY_CAP} slots, ${CATALOG.length} keys)`}>
          <input value={lookup} onChange={(e) => setLookup(e.target.value)} spellCheck={false} placeholder="Aurangabad, Poona, 440001…" aria-label="Resolve a district name, former name or PIN" className={inputClass} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['Aurangabad', '440001', 'Bombay', 'Ahmednagar'].map((k) => (
              <button key={k} type="button" onClick={() => setLookup(k)} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-cloud">
                {k}
              </button>
            ))}
          </div>
          <div className="mt-4" aria-live="polite">
            {!resolved ? null : resolved.found && resolved.value !== undefined ? (
              <div className="rounded-2xl border border-cloud/40 bg-cloud/[0.06] p-4">
                <p className="text-[13px] text-fg-muted">
                  “{resolved.q}” <span className="text-fg-subtle">({resolved.entry?.kind})</span>
                </p>
                <p className="mt-1 font-wide text-xl font-black tracking-[-0.02em] text-cloud">→ {DISTRICTS[resolved.value].name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-muted">
                  <span>{stationCode(resolved.value)}</span>
                  <span>·</span>
                  <span>{fmtC(model.rows[resolved.value].tmax)} today</span>
                  <LevelChip level={model.rows[resolved.value].status.level} />
                </div>
                <p className="mt-3 font-mono text-[10.5px] text-fg-subtle">
                  h = {resolved.home} · {resolved.probes} probe(s): slot {resolved.probeSlots.join(' → ')}
                </p>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13px] text-fg-muted">
                “{resolved.q}” is not a known name, former name or PIN ({resolved.probes} probe(s), stopped at an empty slot).
              </p>
            )}
          </div>
        </Inspector>
      </div>
    </Workspace>
  );
}
