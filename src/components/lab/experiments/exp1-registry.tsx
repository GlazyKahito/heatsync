'use client';

import { useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Layers, Minus, Plus, Search } from 'lucide-react';
import { StaticArray, type StaticArraySnapshot } from '@/lib/ds/static-array';
import type { Step } from '@/lib/ds/trace';
import { DISTRICTS } from '@/lib/data';
import { stationCode, type StationRec } from '@/lib/engine';
import { heatHex } from '@/lib/heat';
import { buttonClass } from '@/components/ui/primitives';
import { cn, fmtC } from '@/lib/utils';
import { stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { EmptyState, Inspector, inputClass, MetaTag, OpGroup, StageCard, StatusBadge } from '../ui';

type Snap = StaticArraySnapshot<StationRec>;

const CAPACITY = 8;
/** sizeof(struct Station) in the C program: int id + char code[8] + char district[32] + float tmax. */
const STRUCT_BYTES = 48;
const BASE_ADDR = 0x6000;
const describe = (s: StationRec) => `${s.code} ${s.name}`;
const create = () => new StaticArray<StationRec>(CAPACITY, { describe });
const addr = (i: number) => `0x${(BASE_ADDR + i * STRUCT_BYTES).toString(16).toUpperCase()}`;

function statusOf(step: Step<Snap> | null): { label: string; tone: ReturnType<typeof stepTone> } | null {
  if (!step) return null;
  const i = step.focus?.[0];
  switch (step.kind) {
    case 'error':
      return { label: step.message.startsWith('Overflow') ? 'Overflow' : 'Underflow', tone: 'error' };
    case 'not-found':
      return { label: 'Not found', tone: 'warn' };
    case 'found':
      return { label: `Found · slots[${i}]`, tone: 'ok' };
    case 'compare':
      return { label: `Compare slots[${i}]`, tone: 'info' };
    case 'insert':
      return { label: `Write slots[${i}]`, tone: 'ok' };
    case 'delete':
      return { label: `Free slots[${i}]`, tone: 'info' };
    default:
      return { label: step.kind, tone: stepTone(step.kind) };
  }
}

function flag(t: number) {
  if (t >= 47) return '≥ 47 °C';
  if (t >= 45) return '≥ 45 °C';
  if (t >= 40) return '≥ 40 °C';
  return '—';
}

function Slot({ index, item, focused, kind }: { index: number; item: StationRec | null; focused: boolean; kind: string | undefined }) {
  const found = focused && kind === 'found';
  return (
    <div
      className={cn(
        'relative flex h-36 flex-col rounded-2xl border p-3 transition-[border-color,background-color,box-shadow,color] duration-300',
        item ? 'border-line-strong bg-white/[0.045]' : 'border-dashed border-line bg-transparent',
        focused && !found && 'border-cloud shadow-[0_0_0_4px_rgba(236,240,241,0.12),0_18px_40px_-20px_rgba(236,240,241,0.45)]',
        found && 'border-cloud bg-cloud text-midnight shadow-[0_18px_50px_-18px_rgba(236,240,241,0.7)]',
      )}
    >
      <div className={cn('flex items-center justify-between font-mono text-[10px]', found ? 'text-midnight/60' : 'text-fg-subtle')}>
        <span className={cn(found ? 'text-midnight' : 'text-fg-muted')}>[{index}]</span>
        <span>{addr(index)}</span>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {item ? (
          <motion.div
            key={item.code}
            initial={{ y: -22, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 22, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="mt-auto min-w-0"
          >
            <p className="font-wide text-lg font-black leading-none tracking-[-0.02em]">{item.code}</p>
            <p className={cn('mt-1 truncate text-[12px]', found ? 'text-midnight/80' : 'text-fg-muted')} title={item.name}>
              {item.name}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(8, Math.min(100, ((item.tmax - 34) / 13) * 100))}%`, background: heatHex(item.tmax) }} />
              </span>
              <span className="font-mono text-[11px] tabular">{item.tmax.toFixed(1)}°</span>
            </div>
          </motion.div>
        ) : (
          <motion.p key="null" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-auto font-mono text-[11px] text-fg-subtle">
            empty
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Exp1Registry({ model, meta, source }: ExpProps) {
  const ds = useRef<StaticArray<StationRec> | null>(null);
  const get = () => (ds.current ??= create());
  const lab = useLab<Snap>(() => create().snapshot());
  const [query, setQuery] = useState('');

  const live = lab.base;
  const present = new Set(live.slots.flatMap((s) => (s ? [s.id] : [])));
  const nextId = model.intel.ranking.find((id) => !present.has(id));
  const toRec = (id: number): StationRec => ({ id, code: stationCode(id), name: DISTRICTS[id].name, tmax: model.rows[id].tmax });
  const next = nextId === undefined ? null : toRec(nextId);
  const full = live.size === CAPACITY;

  const insertNext = () => {
    if (!next) return;
    const t = get().insertLast(next);
    lab.commit({
      op: 'insertLast',
      detail: t.result.ok ? `${describe(next)} (${fmtC(next.tmax)}) → slots[${t.result.index}]` : `Overflow: ${CAPACITY}/${CAPACITY} slots used, ${next.name} rejected.`,
      tone: t.result.ok ? 'ok' : 'error',
      steps: t.steps,
    });
  };

  const fill = () => {
    const arr = get();
    const steps: Step<Snap>[] = [];
    let added = 0;
    for (const id of model.intel.ranking) {
      if (arr.isFull()) break;
      if (present.has(id)) continue;
      const t = arr.insertLast(toRec(id));
      steps.push(...t.steps);
      added++;
    }
    if (added === 0) {
      const t = arr.insertLast(next ?? toRec(model.intel.ranking[0]));
      lab.commit({ op: 'insertLast', detail: 'Overflow: the registry is already full.', tone: 'error', steps: t.steps });
      return;
    }
    lab.commit({ op: 'insertLast', detail: `Filled the registry with ${added} station${added === 1 ? '' : 's'}, hottest first.`, tone: 'ok', steps });
  };

  const deleteLast = () => {
    const t = get().deleteLast();
    lab.commit({
      op: 'deleteLast',
      detail: t.result.ok ? `Removed ${describe(t.result.item)} from slots[${t.result.index}].` : 'Underflow: the registry is empty.',
      tone: t.result.ok ? 'ok' : 'error',
      steps: t.steps,
    });
  };

  const search = (text: string) => {
    const q = text.trim().toLowerCase();
    if (!q) return;
    const t = get().search((s) => s.code.toLowerCase() === q || s.name.toLowerCase() === q, `"${text.trim()}"`);
    const r = t.result;
    lab.commit({
      op: 'search',
      detail: r.found && r.item ? `"${text.trim()}" → slots[${r.index}] ${describe(r.item)} in ${r.comparisons} comparison(s).` : `"${text.trim()}" not found after ${r.comparisons} comparison(s).`,
      tone: r.found ? 'ok' : 'warn',
      steps: t.steps,
    });
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const reset = () => {
    ds.current = create();
    lab.reset(ds.current.snapshot(), 'Registry cleared: size = 0.');
  };

  const frame = lab.frame;
  const step = lab.player.step;
  const focus = new Set(step?.focus ?? []);
  const status = statusOf(step);
  const rows = frame.slots.slice(0, frame.size).flatMap((s, i) => (s ? [{ s, i }] : []));
  const suggestions = [...live.slots.flatMap((s) => (s ? [s.name] : [])).slice(-2), DISTRICTS[model.intel.ranking[35]].name];

  const controls = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <OpGroup
        op="insertLast"
        complexity="O(1)"
        hint={
          next ? (
            <>
              Next hottest station: <span className="text-cloud">{next.code} {next.name}</span> · {fmtC(next.tmax)}
              {full && <span className="block text-fg-subtle">The registry is full, so this insert will overflow.</span>}
            </>
          ) : (
            'Every station is registered.'
          )
        }
      >
        <button type="button" onClick={insertNext} disabled={!next} className={buttonClass('primary', 'sm')}>
          <Plus className="size-4" aria-hidden /> Insert next station
        </button>
        <button type="button" onClick={fill} className={buttonClass('secondary', 'sm')}>
          <Layers className="size-4" aria-hidden /> Fill
        </button>
      </OpGroup>
      <OpGroup op="deleteLast" complexity="O(1)" hint={live.size ? <>Removes slots[{live.size - 1}] ({live.slots[live.size - 1]?.name}).</> : 'The registry is empty, so this delete will underflow.'}>
        <button type="button" onClick={deleteLast} className={buttonClass('secondary', 'sm')}>
          <Minus className="size-4" aria-hidden /> Delete last
        </button>
      </OpGroup>
      <OpGroup op="search" complexity="O(n)" hint="Linear scan by code or district name, case-insensitive.">
        <form onSubmit={onSearch} className="flex w-full min-w-0 gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            list="exp1-stations"
            placeholder="MH32 or Nagpur"
            aria-label="Station code or district name"
            className={inputClass}
          />
          <button type="submit" disabled={!query.trim()} className={buttonClass('secondary', 'sm', 'h-10 shrink-0')} aria-label="Search">
            <Search className="size-4" aria-hidden />
          </button>
        </form>
        <datalist id="exp1-stations">
          {DISTRICTS.map((d) => (
            <option key={d.id} value={d.name}>
              {stationCode(d.id)}
            </option>
          ))}
        </datalist>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => { setQuery(s); search(s); }} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-cloud">
              {s}
            </button>
          ))}
        </div>
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={reset}>
      <StageCard
        title="struct Station registry[8]"
        meta={
          <>
            <MetaTag>
              size {frame.size} / {frame.capacity}
            </MetaTag>
            <MetaTag>sizeof = {STRUCT_BYTES} B</MetaTag>
          </>
        }
        status={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <ol className="grid grid-cols-2 gap-x-2.5 gap-y-8 min-[420px]:grid-cols-4 lg:grid-cols-8">
          {frame.slots.map((item, i) => (
            <li key={i} className="relative">
              <Slot index={i} item={item} focused={focus.has(i)} kind={step?.kind} />
              {i === Math.min(frame.size, CAPACITY - 1) && (
                <motion.span
                  layoutId="exp1-size-pointer"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute -bottom-6 left-0 right-0 whitespace-nowrap text-center font-mono text-[10px] uppercase tracking-[0.1em] text-cloud"
                >
                  {frame.size === CAPACITY ? `▲ size = ${CAPACITY} · full` : `▲ size = ${frame.size}`}
                </motion.span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-10 font-mono text-[11px] leading-relaxed text-fg-subtle">
          &amp;registry[i] = {addr(0)} + i × {STRUCT_BYTES}. Insert writes registry[size] and increments size; delete clears registry[size − 1].
        </p>
      </StageCard>
      <Inspector title="display() · slots[0 … size − 1]">
        {rows.length === 0 ? (
          <EmptyState>No stations yet. Insert the hottest districts of the day.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-[13px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
                  <th scope="col" className="pb-2 font-normal">Slot</th>
                  <th scope="col" className="pb-2 font-normal">Code</th>
                  <th scope="col" className="pb-2 font-normal">District</th>
                  <th scope="col" className="pb-2 text-right font-normal">Tmax</th>
                  <th scope="col" className="pb-2 text-right font-normal">IMD threshold</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, i }) => (
                  <tr key={s.code} className={cn('border-t border-line transition-colors', focus.has(i) && 'bg-white/[0.06]')}>
                    <td className="py-2 font-mono text-[12px] text-fg-subtle">[{i}]</td>
                    <td className="py-2 font-mono text-[12px] text-cloud">{s.code}</td>
                    <td className="py-2 text-cloud">{s.name}</td>
                    <td className="py-2 text-right font-mono text-[12px] text-cloud tabular">{s.tmax.toFixed(1)} °C</td>
                    <td className="py-2 text-right font-mono text-[12px] text-fg-muted">{flag(s.tmax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Inspector>
    </Workspace>
  );
}
