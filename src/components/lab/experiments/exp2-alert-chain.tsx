'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownToLine, CornerDownRight, Eraser, ListPlus, Search, Trash2 } from 'lucide-react';
import { SinglyLinkedList, type LinkedListSnapshot, type ListNodeView } from '@/lib/ds/linked-list';
import type { Step } from '@/lib/ds/trace';
import { DISTRICTS } from '@/lib/data';
import { LEVELS, type Level } from '@/lib/heat';
import { buttonClass, LevelChip } from '@/components/ui/primitives';
import { cn, fmtC } from '@/lib/utils';
import { shortName, stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { EmptyState, Inspector, inputClass, MetaTag, OpGroup, StageCard, StatusBadge } from '../ui';

interface Bulletin {
  no: number;
  district: number;
  level: Level;
  tmax: number;
  followUp: boolean;
}
type Snap = LinkedListSnapshot<Bulletin>;

const describe = (b: Bulletin) => `#${b.no} ${DISTRICTS[b.district].name}`;
const create = () => new SinglyLinkedList<Bulletin>({ describe });

// geometry of the chain drawing (px)
const BOX_W = 172;
const BOX_H = 96;
const ARROW_W = 44;
const UNIT = BOX_W + ARROW_W;
const HEAD_W = 120;
const FLOAT_Y = 8;
const CHAIN_Y = 132;
const nodeX = (i: number) => HEAD_W + i * UNIT;

const ease = [0.16, 1, 0.3, 1] as const;

function Arrow({ dashed }: { dashed?: boolean }) {
  return (
    <svg width={ARROW_W} height="12" viewBox={`0 0 ${ARROW_W} 12`} aria-hidden className="text-silver">
      <line x1="2" y1="6" x2={ARROW_W - 8} y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray={dashed ? '3 3' : undefined} />
      <path d={`M${ARROW_W - 9} 1.5 L${ARROW_W - 2} 6 L${ARROW_W - 9} 10.5`} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function NodeBox({ node, focused, floating, kind }: { node: ListNodeView<Bulletin>; focused: boolean; floating: boolean; kind?: string }) {
  const b = node.value;
  const hit = focused && kind === 'found';
  return (
    <div
      className={cn(
        'flex h-full overflow-hidden rounded-2xl border transition-[border-color,background-color,box-shadow] duration-300',
        floating ? 'border-dashed border-silver/60 bg-asphalt/80' : 'border-line-strong bg-night/90',
        focused && 'border-cloud shadow-[0_0_0_4px_rgba(236,240,241,0.12),0_20px_44px_-22px_rgba(236,240,241,0.5)]',
        hit && 'bg-cloud text-midnight',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('font-mono text-[10px]', hit ? 'text-midnight/70' : 'text-fg-subtle')}>{node.id}</span>
          <span className={cn('font-mono text-[10px]', hit ? 'text-midnight/70' : 'text-fg-subtle')}>{b.followUp ? 'follow-up' : 'bulletin'}</span>
        </div>
        <p className="font-wide text-base font-black leading-none tracking-[-0.02em]">#{b.no}</p>
        <p className={cn('truncate text-[12px]', hit ? 'text-midnight/80' : 'text-cloud/90')} title={DISTRICTS[b.district].name}>
          {shortName(b.district, 14)}
        </p>
        <div className="flex items-center justify-between gap-1">
          <LevelChip level={b.level} className={hit ? 'border-midnight/30' : undefined} />
          <span className="font-mono text-[10.5px] tabular">{b.tmax.toFixed(1)}°</span>
        </div>
      </div>
      <div className={cn('flex w-11 shrink-0 flex-col items-center justify-center gap-1 border-l font-mono text-[9.5px]', hit ? 'border-midnight/20 text-midnight/70' : 'border-line text-fg-subtle')}>
        <span>next</span>
        <span className={hit ? 'text-midnight' : 'text-cloud'}>{node.next ?? 'NULL'}</span>
      </div>
    </div>
  );
}

function ChainView({ snap, focus, kind }: { snap: Snap; focus: Set<string | number>; kind?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const n = snap.nodes.length;
  const index = new Map(snap.nodes.map((nd, i) => [nd.id, i]));
  const fl = snap.floating;
  const flSlot = fl ? (fl.next !== null && index.has(fl.next) ? (index.get(fl.next) as number) : n) : 0;
  const flX = Math.max(0, nodeX(flSlot) - ARROW_W / 2 - BOX_W / 2);
  const targetX = (flSlot < n ? nodeX(flSlot) : nodeX(n)) + (flSlot < n ? BOX_W / 2 : 24);
  const width = nodeX(n) + 96 + (fl && flSlot >= n ? BOX_W : 0);
  const focusId = snap.nodes.find((nd) => focus.has(nd.id))?.id ?? (fl && focus.has(fl.id) ? fl.id : null);
  const focusX = focusId === null ? null : focusId === fl?.id ? flX : nodeX(index.get(focusId) ?? 0);

  useEffect(() => {
    const el = scroller.current;
    if (!el || focusX === null) return;
    const left = focusX - el.clientWidth / 2 + BOX_W / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [focusX]);

  const nodes: { node: ListNodeView<Bulletin>; x: number; y: number; floating: boolean; last: boolean }[] = snap.nodes.map((nd, i) => ({ node: nd, x: nodeX(i), y: CHAIN_Y, floating: false, last: i === n - 1 }));
  if (fl) nodes.push({ node: fl, x: flX, y: FLOAT_Y, floating: true, last: false });

  return (
    <div ref={scroller} className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-2">
      <div className="relative" style={{ width, height: CHAIN_Y + BOX_H + 12 }}>
        {fl && (
          <svg className="pointer-events-none absolute inset-0" width={width} height={CHAIN_Y + BOX_H} aria-hidden>
            <path
              d={`M${flX + BOX_W / 2} ${FLOAT_Y + BOX_H} C ${flX + BOX_W / 2} ${CHAIN_Y - 8}, ${targetX} ${FLOAT_Y + BOX_H + 6}, ${targetX} ${CHAIN_Y - 4}`}
              fill="none"
              stroke="#bdc3c7"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <circle cx={targetX} cy={CHAIN_Y - 4} r="3" fill="#bdc3c7" />
          </svg>
        )}
        {/* head pointer */}
        <div className="absolute flex items-center" style={{ left: 0, top: CHAIN_Y + BOX_H / 2 - 18, width: HEAD_W }}>
          <span className="rounded-xl border border-cloud/60 bg-cloud px-2.5 py-1.5 font-mono text-[11px] font-semibold text-midnight">head</span>
          <span className="flex-1 pl-1">
            <svg width="100%" height="12" viewBox="0 0 60 12" preserveAspectRatio="none" aria-hidden className="text-cloud">
              <line x1="0" y1="6" x2="52" y2="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M51 1.5 L58 6 L51 10.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
        </div>
        <AnimatePresence initial={false}>
          {nodes.map(({ node, x, y, floating, last }) => (
            <motion.div
              key={node.id}
              className="absolute left-0 top-0 flex items-center"
              style={{ height: BOX_H }}
              initial={{ x, y: y - 40, opacity: 0 }}
              animate={{ x, y, opacity: 1 }}
              exit={{ y: y + 40, opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.55, ease }}
            >
              <div style={{ width: BOX_W, height: BOX_H }}>
                <NodeBox node={node} focused={focus.has(node.id)} floating={floating} kind={kind} />
              </div>
              {!floating && !last && <Arrow />}
            </motion.div>
          ))}
        </AnimatePresence>
        {/* NULL terminator */}
        <motion.div
          className="absolute left-0 flex items-center"
          style={{ top: CHAIN_Y + BOX_H / 2 - 14 }}
          initial={false}
          animate={{ x: n === 0 ? HEAD_W : nodeX(n) - ARROW_W }}
          transition={{ duration: 0.55, ease }}
        >
          {n > 0 && <Arrow />}
          <span className="rounded-lg border border-dashed border-line-strong px-2 py-1 font-mono text-[11px] text-fg-subtle">NULL</span>
        </motion.div>
      </div>
    </div>
  );
}

function statusOf(step: Step<Snap> | null) {
  if (!step) return null;
  const labels: Record<string, string> = { alloc: 'malloc', insert: 'Linked', visit: 'Traverse', found: 'Target found', unlink: 'Unlink', delete: 'free()', error: 'Error', 'not-found': 'Not found' };
  return { label: labels[step.kind] ?? step.kind, tone: stepTone(step.kind) };
}

export function Exp2AlertChain({ model, meta, source }: ExpProps) {
  const ds = useRef<SinglyLinkedList<Bulletin> | null>(null);
  const get = () => (ds.current ??= create());
  const lab = useLab<Snap>(() => create().snapshot());
  const [nextNo, setNextNo] = useState(101);
  const [target, setTarget] = useState('');

  const live = lab.base;
  const issued = new Set(live.nodes.flatMap((nd) => (nd.value.followUp ? [] : [nd.value.district])));
  const warned = model.rows
    .filter((r) => r.status.level !== 'green')
    .sort((a, b) => LEVELS[a.status.level].rank - LEVELS[b.status.level].rank || a.tmax - b.tmax);
  const queue = warned.filter((r) => !issued.has(r.id));
  const nextRow = queue[0] ?? null;
  const defaultTarget = live.nodes[1]?.value.no ?? live.nodes[0]?.value.no ?? null;
  const targetNo = target.trim() === '' ? defaultTarget : Number(target);
  const validTarget = targetNo !== null && Number.isInteger(targetNo) && targetNo > 0;

  const bulletinFor = (id: number, no: number, followUp = false): Bulletin => ({ no, district: id, level: model.rows[id].status.level, tmax: model.rows[id].tmax, followUp });
  const byNo = (no: number) => (b: Bulletin) => b.no === no;

  const insertBegin = (count: number) => {
    const list = get();
    const steps: Step<Snap>[] = [];
    const added: Bulletin[] = [];
    let no = nextNo;
    for (const r of queue.slice(0, count)) {
      const b = bulletinFor(r.id, no++);
      steps.push(...list.insertAtBegin(b).steps);
      added.push(b);
    }
    if (!added.length) return;
    setNextNo(no);
    lab.commit({
      op: 'insertAtBegin',
      detail: added.length === 1 ? `${describe(added[0])} (${LEVELS[added[0].level].label}) is the new head.` : `Issued ${added.map((b) => `#${b.no}`).join(', ')}; ${describe(added[added.length - 1])} is the head.`,
      tone: 'ok',
      steps,
    });
  };

  const insertAfter = () => {
    if (!validTarget) return;
    const ref = live.nodes.find((nd) => nd.value.no === targetNo)?.value;
    const b: Bulletin = ref ? { ...ref, no: nextNo, followUp: true } : bulletinFor(model.intel.ranking[0], nextNo, true);
    const t = get().insertAfter(byNo(targetNo), b);
    if (t.result.ok) setNextNo(nextNo + 1);
    lab.commit({
      op: 'insertAfter',
      detail: t.result.ok ? `Follow-up #${b.no} for ${DISTRICTS[b.district].name} linked after #${targetNo}.` : t.result.reason === 'empty' ? 'The chain is empty.' : `Bulletin #${targetNo} is not in the chain.`,
      tone: t.result.ok ? 'ok' : 'error',
      steps: t.steps,
    });
  };

  const deleteBefore = () => {
    if (!validTarget) return;
    const t = get().deleteBefore(byNo(targetNo));
    const r = t.result;
    const why = !r.ok ? (r.reason === 'no-predecessor' ? `#${targetNo} is the head; nothing comes before it.` : r.reason === 'empty' ? 'The chain is empty.' : `Bulletin #${targetNo} is not in the chain.`) : '';
    lab.commit({
      op: 'deleteBefore',
      detail: r.ok ? `Deleted ${describe(r.value)} (${r.case === 'head' ? 'case: head node' : 'case: general'}).` : why,
      tone: r.ok ? 'ok' : 'error',
      steps: t.steps,
    });
  };

  const deleteFirst = () => {
    const t = get().deleteFirst();
    lab.commit({ op: 'deleteFirst', detail: t.result.ok ? `Deleted head ${describe(t.result.value)}.` : 'Underflow: head is NULL.', tone: t.result.ok ? 'ok' : 'error', steps: t.steps });
  };

  const find = () => {
    if (!validTarget) return;
    const t = get().find((b) => b.no === targetNo);
    lab.commit({
      op: 'find',
      detail: t.result ? `#${targetNo} is ${DISTRICTS[t.result.value.district].name} at position ${t.result.index}.` : `#${targetNo} is not in the chain.`,
      tone: t.result ? 'ok' : 'warn',
      steps: t.steps,
    });
  };

  const reset = () => {
    ds.current = create();
    setNextNo(101);
    setTarget('');
    lab.reset(ds.current.snapshot(), 'Chain cleared: head = NULL.');
  };

  const frame = lab.frame;
  const step = lab.player.step;
  const focus = new Set<string | number>(step?.focus ?? []);
  const status = statusOf(step);

  const controls = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <OpGroup
        op="insertAtBegin"
        complexity="O(1)"
        hint={
          nextRow ? (
            <>
              Next warned district: <span className="text-cloud">{DISTRICTS[nextRow.id].name}</span> · {LEVELS[nextRow.status.level].label} · {fmtC(nextRow.tmax)}
              <span className="block text-fg-subtle">{queue.length} of {warned.length} warned districts still without a bulletin, mildest first.</span>
            </>
          ) : warned.length ? (
            `All ${warned.length} warned districts have a bulletin.`
          ) : (
            'No district is at watch level or above on this day.'
          )
        }
      >
        <button type="button" onClick={() => insertBegin(1)} disabled={!nextRow} className={buttonClass('primary', 'sm')}>
          <ArrowDownToLine className="size-4" aria-hidden /> Insert at begin
        </button>
        <button type="button" onClick={() => insertBegin(3)} disabled={!nextRow} className={buttonClass('secondary', 'sm')}>
          <ListPlus className="size-4" aria-hidden /> Issue 3
        </button>
        <button type="button" onClick={deleteFirst} className={buttonClass('ghost', 'sm')}>
          <Eraser className="size-4" aria-hidden /> Delete first
        </button>
      </OpGroup>
      <OpGroup
        op="insertAfter / deleteBefore / find"
        complexity="O(n)"
        hint={<>Pick a bulletin number. Delete-before covers all three cases: target is the head (error), the 2nd node (head deleted) or any later node.</>}
      >
        <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <span className="shrink-0 font-mono text-[11px] text-fg-subtle">bulletin #</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder={defaultTarget === null ? '101' : String(defaultTarget)}
            aria-label="Target bulletin number"
            className={cn(inputClass, 'w-24')}
          />
        </label>
        <button type="button" onClick={insertAfter} disabled={!validTarget} className={buttonClass('secondary', 'sm')}>
          <CornerDownRight className="size-4" aria-hidden /> Insert follow-up after
        </button>
        <button type="button" onClick={deleteBefore} disabled={!validTarget} className={buttonClass('secondary', 'sm')}>
          <Trash2 className="size-4" aria-hidden /> Delete before
        </button>
        <button type="button" onClick={find} disabled={!validTarget} className={buttonClass('ghost', 'sm')}>
          <Search className="size-4" aria-hidden /> Find
        </button>
        {live.nodes.length > 0 && (
          <div className="flex w-full flex-wrap gap-1.5">
            {live.nodes.slice(0, 8).map((nd) => (
              <button
                key={nd.id}
                type="button"
                onClick={() => setTarget(String(nd.value.no))}
                aria-pressed={targetNo === nd.value.no}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors',
                  targetNo === nd.value.no ? 'border-cloud bg-cloud text-midnight' : 'border-line text-fg-muted hover:border-line-strong hover:text-cloud',
                )}
              >
                #{nd.value.no}
              </button>
            ))}
          </div>
        )}
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={reset}>
      <StageCard
        title="struct Node *head"
        meta={<MetaTag>{frame.nodes.length} node{frame.nodes.length === 1 ? '' : 's'}</MetaTag>}
        status={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <ChainView snap={frame} focus={focus} kind={step?.kind} />
        <p className="mt-3 font-mono text-[11px] text-fg-subtle">
          Newest bulletin at the head. A node drawn above the chain is allocated but not linked yet, or unlinked and about to be freed.
        </p>
      </StageCard>
      <Inspector title="display() · tabular">
        {frame.nodes.length === 0 ? (
          <EmptyState>head = NULL. Issue a bulletin to start the chain.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-[13px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
                  <th scope="col" className="pb-2 font-normal">Pos</th>
                  <th scope="col" className="pb-2 font-normal">Node</th>
                  <th scope="col" className="pb-2 font-normal">Bulletin</th>
                  <th scope="col" className="pb-2 font-normal">District</th>
                  <th scope="col" className="pb-2 font-normal">Level</th>
                  <th scope="col" className="pb-2 text-right font-normal">Tmax</th>
                  <th scope="col" className="pb-2 text-right font-normal">next</th>
                </tr>
              </thead>
              <tbody>
                {frame.nodes.map((nd, i) => (
                  <tr key={nd.id} className={cn('border-t border-line transition-colors', focus.has(nd.id) && 'bg-white/[0.06]')}>
                    <td className="py-2 font-mono text-[12px] text-fg-subtle">{i}</td>
                    <td className="py-2 font-mono text-[12px] text-fg-muted">{nd.id}</td>
                    <td className="py-2 font-mono text-[12px] text-cloud">
                      #{nd.value.no}
                      {nd.value.followUp && <span className="ml-1.5 text-fg-subtle">follow-up</span>}
                    </td>
                    <td className="py-2 text-cloud">{DISTRICTS[nd.value.district].name}</td>
                    <td className="py-2">
                      <LevelChip level={nd.value.level} />
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] text-cloud tabular">{nd.value.tmax.toFixed(1)} °C</td>
                    <td className="py-2 text-right font-mono text-[12px] text-fg-subtle">{nd.next ?? 'NULL'}</td>
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
