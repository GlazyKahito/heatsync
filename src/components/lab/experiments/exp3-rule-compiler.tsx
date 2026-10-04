'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Cpu, Play, X } from 'lucide-react';
import {
  compileRule,
  evaluatePostfix,
  tokenize,
  tokensToString,
  type CompiledRule,
  type EvalSnapshot,
  type InfixSnapshot,
  type RuleValue,
  type Token,
} from '@/lib/ds/stack';
import type { Step } from '@/lib/ds/trace';
import { DISTRICTS } from '@/lib/data';
import { IMD_RULES } from '@/lib/heat';
import { buttonClass, LevelChip } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { departure, mapSteps, shortName, stepTone, type ExpProps } from '../model';
import { useLab } from '../use-lab';
import { Workspace } from '../workspace';
import { DistrictSelect, EmptyState, Inspector, inputClass, MetaTag, OpGroup, StageCard, StatusBadge } from '../ui';

type Frame = { mode: 'convert'; snap: InfixSnapshot } | { mode: 'eval'; snap: EvalSnapshot } | null;

const PRESETS: { label: string; rule: string }[] = [
  { label: 'Plains · heatwave', rule: IMD_RULES.plains.heatwave },
  { label: 'Plains · severe', rule: IMD_RULES.plains.severe },
  { label: 'Plains · watch', rule: IMD_RULES.plains.watch },
  { label: 'Coastal · heatwave', rule: IMD_RULES.coastal.heatwave },
  { label: 'Coastal · severe', rule: IMD_RULES.coastal.severe },
  { label: 'Invalid · missing )', rule: 'tmax >= 40 && (dep >= 4.5 || feels >= 45' },
];

const ACTION: Record<string, string> = {
  output: 'Operand → postfix',
  push: 'Push',
  pop: 'Pop → postfix',
  discard: "Pop '(' · discard",
  flush: 'End · pop → postfix',
  done: 'Done',
  error: 'Error',
};

const fmtValue = (v: RuleValue) => (typeof v === 'boolean' ? String(v) : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

function envFor(model: ExpProps['model'], id: number): Record<string, RuleValue> {
  const r = model.rows[id];
  return { tmax: r.tmax, dep: departure(r), feels: r.feels ?? r.tmax, rh: r.rh ?? 0 };
}

function TokenChip({ token, active, index }: { token: Token; active: boolean; index: number }) {
  return (
    <motion.span
      layout
      animate={{ y: active ? -4 : 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={cn(
        'relative inline-flex flex-col items-center rounded-xl border px-2.5 pb-1 pt-1.5 font-mono text-[13px] transition-colors duration-200',
        active
          ? 'border-cloud bg-cloud text-midnight shadow-[0_14px_30px_-14px_rgba(236,240,241,0.7)]'
          : token.type === 'op'
            ? 'border-silver/30 bg-silver/10 text-cloud'
            : token.type === 'ident'
              ? 'border-line-strong text-cloud'
              : token.type === 'number'
                ? 'border-line text-white'
                : 'border-line text-fg-subtle',
      )}
    >
      {token.text}
      <span className={cn('mt-0.5 text-[8.5px] uppercase tracking-[0.1em]', active ? 'text-midnight/60' : 'text-fg-subtle')}>{index}</span>
    </motion.span>
  );
}

/** Vertical stack, top first. Items are keyed by depth so pushes drop in from above and pops slide out. */
function StackColumn({ items, label, empty }: { items: string[]; label: string; empty: string }) {
  const depth = items.length;
  return (
    <div className="flex min-w-0 flex-col">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">{label}</p>
      <div className="relative mt-2 flex min-h-48 flex-1 flex-col justify-end rounded-2xl border border-line bg-void/60 p-2">
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((text, i) => (
              <motion.div
                key={`${depth - i}-${text}`}
                layout
                initial={{ opacity: 0, y: -26, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={cn(
                  'flex items-center justify-between rounded-xl border px-3 py-2 font-mono text-[13px]',
                  i === 0 ? 'border-cloud/70 bg-cloud/[0.12] text-cloud' : 'border-line bg-white/[0.03] text-fg-muted',
                  text === 'true' && 'text-cloud',
                )}
              >
                <span>{text}</span>
                {i === 0 && <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-subtle">top</span>}
              </motion.div>
            ))}
          </AnimatePresence>
          {items.length === 0 && <p className="py-6 text-center font-mono text-[11px] text-fg-subtle">{empty}</p>}
        </div>
        <span aria-hidden className="mt-2 block h-1 rounded-full bg-line-strong" />
      </div>
    </div>
  );
}

function ConversionTable({ steps, active }: { steps: readonly Step<InfixSnapshot>[]; active: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const row = el?.querySelector<HTMLTableRowElement>(`[data-row="${active}"]`);
    if (!el || !row) return;
    const top = row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2;
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [active]);
  return (
    <div ref={scroller} data-lenis-prevent className="scrollbar-thin relative max-h-[22rem] overflow-auto overscroll-contain rounded-2xl border border-line bg-void/50">
      <table className="w-full min-w-[30rem] text-left text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-night/95 backdrop-blur">
          <tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
            <th scope="col" className="px-3 py-2 font-normal">#</th>
            <th scope="col" className="px-3 py-2 font-normal">Symbol</th>
            <th scope="col" className="px-3 py-2 font-normal">Action</th>
            <th scope="col" className="px-3 py-2 font-normal">Stack (bottom → top)</th>
            <th scope="col" className="px-3 py-2 font-normal">Postfix</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {steps.map((s, i) => {
            const on = i === active;
            const future = active >= 0 && i > active;
            return (
              <tr
                key={i}
                data-row={i}
                className={cn(
                  'border-t border-line transition-[background-color,opacity] duration-200',
                  on && 'bg-cloud/[0.1]',
                  future && 'opacity-25',
                  s.kind === 'error' && 'text-cloud',
                )}
              >
                <td className="px-3 py-1.5 text-fg-subtle tabular">{i + 1}</td>
                <td className={cn('px-3 py-1.5', on ? 'text-cloud' : 'text-fg-muted')}>{s.snapshot.token || '—'}</td>
                <td className={cn('whitespace-nowrap px-3 py-1.5', on ? 'text-cloud' : 'text-fg-muted')}>
                  {s.kind === 'error' && <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-imd-red align-middle" />}
                  {ACTION[s.snapshot.action] ?? s.snapshot.action}
                </td>
                <td className="px-3 py-1.5 text-fg-muted">{s.snapshot.stack.slice().reverse().join(' ') || '∅'}</td>
                <td className={cn('px-3 py-1.5', on ? 'text-cloud' : 'text-fg-muted')}>{s.snapshot.output.join(' ') || '∅'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface EvalRun {
  district: number;
  env: Record<string, RuleValue>;
  postfix: Token[];
  value: RuleValue;
  error?: string;
}

export function Exp3RuleCompiler({ model, meta, source }: ExpProps) {
  const lab = useLab<Frame>(() => null);
  const [rule, setRule] = useState<string>(IMD_RULES.plains.heatwave);
  const [compiled, setCompiled] = useState<(CompiledRule & { rule: string }) | null>(null);
  const [district, setDistrict] = useState(model.intel.ranking[0]);
  const [evalRun, setEvalRun] = useState<EvalRun | null>(null);

  const liveTokens = useMemo(() => tokenize(rule), [rule]);
  const fresh = compiled !== null && compiled.rule === rule;
  const canEval = fresh && compiled.error === undefined;
  const env = envFor(model, district);

  const compile = (text: string) => {
    const c = compileRule(text);
    setCompiled({ ...c, rule: text });
    setEvalRun(null);
    lab.commit({
      op: 'infixToPostfix',
      detail: c.error ? `Error: ${c.error}` : `${c.tokens.length} tokens → ${tokensToString(c.postfix)}`,
      tone: c.error ? 'error' : 'ok',
      steps: mapSteps(c.steps, (snap) => ({ mode: 'convert' as const, snap })),
    });
  };

  const evaluate = () => {
    if (!canEval) return;
    const e = envFor(model, district);
    const t = evaluatePostfix(compiled.postfix, e);
    setEvalRun({ district, env: e, postfix: compiled.postfix, value: t.result.value, error: t.result.error });
    lab.commit({
      op: 'evaluatePostfix',
      detail: t.result.error ? `${DISTRICTS[district].name}: ${t.result.error}` : `${DISTRICTS[district].name}: rule ${t.result.value === true ? 'fires (true)' : 'does not fire (false)'}.`,
      tone: t.result.error ? 'error' : t.result.value === true ? 'ok' : 'info',
      steps: mapSteps(t.steps, (snap) => ({ mode: 'eval' as const, snap })),
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    compile(rule);
  };

  const reset = () => {
    setRule(IMD_RULES.plains.heatwave);
    setCompiled(null);
    setEvalRun(null);
    lab.reset(null, 'Rule compiler reset.');
  };

  const frame = lab.frame;
  const step = lab.player.step;
  const focusIdx = typeof step?.focus?.[0] === 'number' ? step.focus[0] : -1;

  const convSteps: readonly Step<InfixSnapshot>[] =
    frame?.mode === 'convert'
      ? lab.player.steps.flatMap((s) => (s.snapshot?.mode === 'convert' ? [{ ...s, snapshot: s.snapshot.snap }] : []))
      : (compiled?.steps ?? []);
  const convActive = frame?.mode === 'convert' ? lab.player.index : -1;
  const shownTokens = compiled?.tokens && fresh ? compiled.tokens : liveTokens.tokens;
  const tokenError = liveTokens.error ?? null;
  const convSnap: InfixSnapshot | null = frame?.mode === 'convert' ? frame.snap : (compiled?.steps[compiled.steps.length - 1]?.snapshot ?? null);
  const opStack = convSnap?.stack ?? [];
  const output = convSnap?.output ?? [];

  const evalSnap: EvalSnapshot | null = frame?.mode === 'eval' ? frame.snap : null;
  const evalDone = evalRun !== null && (frame?.mode !== 'eval' || lab.player.index === lab.player.steps.length - 1);
  const evalStack = evalSnap ? evalSnap.stack.map(fmtValue) : evalRun && !evalRun.error ? [fmtValue(evalRun.value)] : [];
  const evalFocus = frame?.mode === 'eval' ? focusIdx : -1;

  const firing = useMemo(() => {
    if (!canEval) return null;
    return model.rows
      .filter((r) => evaluatePostfix(compiled.postfix, envFor(model, r.id), { maxSteps: 0 }).result.value === true)
      .sort((a, b) => b.tmax - a.tmax)
      .map((r) => r.id);
  }, [canEval, compiled, model]);

  const status = step ? { label: step.kind === 'result' ? `Result · ${evalRun ? fmtValue(evalRun.value) : ''}` : step.kind, tone: stepTone(step.kind) } : null;

  const controls = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <OpGroup op="tokenize → infixToPostfix" complexity="O(n)" hint="Write a rule over tmax, dep (departure from normal), feels and rh. Operators: + − * / > >= < <= == != && || ! and parentheses.">
        <form onSubmit={onSubmit} className="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
          <input value={rule} onChange={(e) => setRule(e.target.value)} spellCheck={false} aria-label="Infix rule" className={inputClass} />
          <button type="submit" className={buttonClass('primary', 'sm', 'h-10 shrink-0')}>
            <Cpu className="size-4" aria-hidden /> Compile
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setRule(p.rule);
                compile(p.rule);
              }}
              aria-pressed={rule === p.rule}
              className={cn(
                'rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors',
                rule === p.rule ? 'border-cloud bg-cloud text-midnight' : 'border-line text-fg-muted hover:border-line-strong hover:text-cloud',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </OpGroup>
      <OpGroup
        op="evaluatePostfix"
        complexity="O(n)"
        hint={canEval ? 'Evaluate the compiled postfix with a district’s readings for the selected day.' : compiled && fresh ? 'Fix the rule first: it did not compile.' : 'Compile the rule first.'}
      >
        <DistrictSelect value={district} onChange={setDistrict} rows={model.rows} className="w-full" />
        <button type="button" onClick={evaluate} disabled={!canEval} className={buttonClass('secondary', 'sm')}>
          <Play className="size-4" aria-hidden /> Evaluate
        </button>
        <div className="flex w-full flex-wrap gap-1.5 font-mono text-[11px]">
          {Object.entries(env).map(([k, v]) => (
            <span key={k} className="rounded-full border border-line px-2.5 py-1 text-fg-muted">
              {k} = <span className="text-cloud">{fmtValue(v)}</span>
            </span>
          ))}
        </div>
      </OpGroup>
    </div>
  );

  return (
    <Workspace meta={meta} source={source} lab={lab} controls={controls} onReset={reset}>
      <StageCard
        title="Shunting-yard · LinkedStack<Token>"
        meta={<MetaTag>{shownTokens.length} tokens</MetaTag>}
        status={status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Infix tokens</p>
        <div className="mt-2 flex min-h-14 flex-wrap items-end gap-1.5">
          {shownTokens.map((tk, i) => (
            <TokenChip key={`${i}-${tk.text}`} token={tk} index={i} active={frame?.mode === 'convert' && focusIdx === i && step?.kind !== 'error'} />
          ))}
          {shownTokens.length === 0 && <span className="font-mono text-[12px] text-fg-subtle">Type a rule to see its tokens.</span>}
        </div>
        {tokenError && (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-void/60 p-3 font-mono text-[12.5px]">
            <pre className="text-cloud">{rule}</pre>
            <pre className="text-cloud">{' '.repeat(tokenError.pos)}^</pre>
            <p className="mt-1 inline-flex items-center gap-1.5 text-fg-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-imd-red" /> {tokenError.message}
            </p>
          </div>
        )}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="min-w-0">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Conversion table</p>
            {convSteps.length ? <ConversionTable steps={convSteps} active={convActive} /> : <EmptyState>Press Compile to convert the rule; each row is one step of the stack.</EmptyState>}
          </div>
          <StackColumn items={opStack} label="Operator stack" empty="empty" />
        </div>
        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Postfix output</p>
          <div className="mt-2 flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-void/50 p-2">
            <AnimatePresence initial={false} mode="popLayout">
              {output.map((t, i) => (
                <motion.span
                  key={`${i}-${t}`}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-line-strong bg-white/[0.05] px-2 py-1 font-mono text-[12.5px] text-cloud"
                >
                  {t}
                </motion.span>
              ))}
            </AnimatePresence>
            {output.length === 0 && <span className="px-2 font-mono text-[11px] text-fg-subtle">∅</span>}
          </div>
          {compiled?.error && fresh && (
            <p className="mt-3 inline-flex items-start gap-2 text-sm text-fg-muted">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-imd-red" /> {compiled.error}
            </p>
          )}
        </div>
      </StageCard>

      <Inspector title={`evaluatePostfix() · ${evalRun ? DISTRICTS[evalRun.district].name : DISTRICTS[district].name}`}>
        {!evalRun ? (
          <EmptyState>{canEval ? 'Choose a district and press Evaluate to run the postfix with its readings.' : 'Compile a valid rule, then evaluate it for a district.'}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Postfix, read left to right</p>
              <div className="mt-2 flex flex-wrap items-end gap-1.5">
                {evalRun.postfix.map((tk, i) => (
                  <TokenChip key={`${i}-${tk.text}`} token={tk} index={i} active={evalFocus === i} />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5 font-mono text-[11px]">
                {Object.entries(evalRun.env).map(([k, v]) => (
                  <span key={k} className="rounded-full border border-line px-2.5 py-1 text-fg-muted">
                    {k} = <span className="text-cloud">{fmtValue(v)}</span>
                  </span>
                ))}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {evalDone ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      'mt-5 flex flex-wrap items-center gap-3 rounded-2xl border p-4',
                      evalRun.value === true && !evalRun.error ? 'border-cloud/60 bg-cloud text-midnight' : 'border-line-strong bg-white/[0.04] text-cloud',
                    )}
                  >
                    {evalRun.error ? <X className="size-5" aria-hidden /> : evalRun.value === true ? <Check className="size-5" aria-hidden /> : <X className="size-5" aria-hidden />}
                    <p className="font-wide text-xl font-black tracking-[-0.02em]">{evalRun.error ? 'Error' : evalRun.value === true ? 'Rule fires' : 'Rule does not fire'}</p>
                    <p className={cn('text-sm', evalRun.value === true ? 'text-midnight/75' : 'text-fg-muted')}>
                      {evalRun.error ?? `Result ${fmtValue(evalRun.value)} for ${DISTRICTS[evalRun.district].name}.`}
                    </p>
                    <span className="ml-auto inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em]">
                      Today <LevelChip level={model.rows[evalRun.district].status.level} />
                    </span>
                  </motion.div>
                ) : (
                  <motion.p key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 font-mono text-[12px] text-fg-subtle">
                    Evaluating… {evalSnap?.token ? `token ${evalSnap.token}` : ''}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <StackColumn items={evalStack} label="Operand stack" empty="empty" />
          </div>
        )}
        {firing && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
              This rule fires for {firing.length} of 36 districts on this day
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {firing.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDistrict(id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                    id === district ? 'border-cloud bg-cloud text-midnight' : 'border-line text-fg-muted hover:border-line-strong hover:text-cloud',
                  )}
                >
                  {shortName(id, 14)} <span className="font-mono text-[10.5px] opacity-70">{model.rows[id].tmax.toFixed(1)}</span>
                </button>
              ))}
              {firing.length === 0 && <span className="text-sm text-fg-subtle">None.</span>}
            </div>
          </div>
        )}
      </Inspector>
    </Workspace>
  );
}
