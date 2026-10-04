'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, CornerDownRight, Database, Loader2, Search, Send, ShieldCheck } from 'lucide-react';
import { buttonClass, LevelChip, LevelDot } from '@/components/ui/primitives';
import { AUDIENCES, generateAdvisory, type Audience } from '@/lib/advisory';
import { DISTRICTS, replayHourly } from '@/lib/data';
import { compiledRules, loadArchive, rankAgainstHistory, ruleLevel, sensorRing, stationRegistry, type Archive, type Bulletin } from '@/lib/engine';
import { BST } from '@/lib/ds/bst';
import { tokensToString } from '@/lib/ds/stack';
import { IMD_RULES, LEVELS, heatHex } from '@/lib/heat';
import type { LiveState } from '@/lib/live';
import { cn, fmtDay, fmtSigned } from '@/lib/utils';
import type { ConsoleState } from './use-console';

const ease = [0.16, 1, 0.3, 1] as const;

export function PanelHeader({ exp, title, children }: { exp: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">{exp}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-cloud">{title}</h2>
      {children && <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{children}</p>}
    </div>
  );
}

// ── Hotspots: BST ranking + range query ─────────────────────────────────────────────────────────────────────────────
export function HotspotsPanel({ c }: { c: ConsoleState }) {
  const { snapshot: s, intel } = c;
  const [lo, setLo] = useState(40);
  const [hi, setHi] = useState(48);
  const band = useMemo(() => {
    const tree = new BST<{ t: number; id: number }, number>((a, b) => a.t - b.t || a.id - b.id, { maxSteps: 0 });
    s.rows.forEach((r) => tree.insert({ t: r.tmax, id: r.id }, r.id));
    return tree.rangeQuery({ t: lo, id: -1 }, { t: hi, id: 99 }).result.map((e) => e.value).reverse();
  }, [s, lo, hi]);
  const max = s.rows[intel.ranking[0]].tmax;
  return (
    <div>
      <PanelHeader exp="EXP 05 · Binary search tree" title="Hotspot index">
        36 districts keyed by Tmax; reverse in-order traversal gives the ranking. Tree height {intel.bstHeight}.
      </PanelHeader>
      <ol className="space-y-1">
        {intel.ranking.map((id, i) => {
          const r = s.rows[id];
          return (
            <li key={id}>
              <button
                onClick={() => c.setSelected(id)}
                className={cn(
                  'group grid w-full grid-cols-[1.4rem_1fr_5.5rem_3.2rem] items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]',
                  c.selected === id && 'bg-white/[0.08]',
                )}
              >
                <span className="font-mono text-[10px] text-fg-subtle tabular">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <LevelDot level={r.status.level} className="size-1.5" />
                  <span className="truncate text-[13px] text-cloud">{DISTRICTS[id].name}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.span
                    className="block h-full rounded-full"
                    initial={false}
                    animate={{ width: `${Math.max(4, ((r.tmax - 28) / (max - 28)) * 100)}%` }}
                    transition={{ duration: 0.7, ease }}
                    style={{ background: heatHex(r.tmax) }}
                  />
                </span>
                <span className="text-right font-mono text-xs text-cloud tabular">{r.tmax.toFixed(1)}°</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 rounded-2xl border border-line bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Range query · rangeQuery(lo, hi)</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-fg-muted">
          <label className="grid gap-1">
            From {lo} °C
            <input type="range" min={30} max={48} step={0.5} value={lo} onChange={(e) => setLo(Math.min(Number(e.target.value), hi))} className="accent-cloud" />
          </label>
          <label className="grid gap-1">
            To {hi} °C
            <input type="range" min={30} max={48} step={0.5} value={hi} onChange={(e) => setHi(Math.max(Number(e.target.value), lo))} className="accent-cloud" />
          </label>
        </div>
        <p className="mt-3 text-sm text-cloud">
          {band.length} district{band.length === 1 ? '' : 's'} between {lo} and {hi} °C
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{band.map((id) => DISTRICTS[id].name).join(', ') || '—'}</p>
      </div>
    </div>
  );
}

// ── Spread: BFS clusters, alert rings, relief staging ───────────────────────────────────────────────────────────────
export function SpreadPanel({ c }: { c: ConsoleState }) {
  const { intel, snapshot: s } = c;
  return (
    <div>
      <PanelHeader exp="EXP 06 · Graph + BFS" title="Heat spread">
        Adjacency matrix of 77 real shared borders. BFS groups hot districts into contiguous zones and finds the nearest cooler district.
      </PanelHeader>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Contiguous hot zones · components()</p>
      <ul className="mt-2 space-y-2">
        {intel.clusters.length === 0 && <li className="text-sm text-fg-muted">No district is at watch level or above.</li>}
        {intel.clusters.map((cl, i) => {
          const set = new Set(cl);
          const on = c.emphasis && cl.every((v) => c.emphasis!.has(v)) && c.emphasis.size === cl.length;
          const peak = Math.max(...cl.map((v) => s.rows[v].tmax));
          return (
            <li key={i}>
              <button
                onClick={() => c.setEmphasis(on ? null : set)}
                className={cn('w-full rounded-2xl border p-3 text-left transition-colors', on ? 'border-cloud/50 bg-white/[0.07]' : 'border-line bg-white/[0.02] hover:bg-white/[0.05]')}
              >
                <span className="flex items-center justify-between text-sm text-cloud">
                  Zone {i + 1} · {cl.length} district{cl.length === 1 ? '' : 's'}
                  <span className="font-mono text-xs text-silver">peak {peak.toFixed(1)}°</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{cl.map((v) => DISTRICTS[v].name).join(' · ')}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
        Alert rings · bfs({DISTRICTS[intel.bfs.source].name})
      </p>
      <ol className="mt-2 space-y-1.5">
        {intel.rings.map((ring, lv) => (
          <li key={lv} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
            <span className="font-mono text-fg-subtle">{lv === 0 ? 'source' : `level ${lv}`}</span>
            <span className="text-fg-muted">{ring.map((v) => DISTRICTS[v].name).join(', ')}</span>
          </li>
        ))}
      </ol>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Relief staging · nearest()</p>
      <ul className="mt-2 space-y-2">
        {intel.relief.length === 0 && <li className="text-sm text-fg-muted">No district meets the heatwave criteria on this day.</li>}
        {intel.relief.map((r) => (
          <li key={r.from} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2 text-xs text-fg-muted">
            {r.path ? (
              <span className="flex flex-wrap items-center gap-1">
                {r.path.map((v, i) => (
                  <span key={v} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="size-3 text-fg-subtle" aria-hidden />}
                    <span className={cn(i === 0 && 'text-cloud', i === r.path!.length - 1 && 'text-cloud underline decoration-silver/50 underline-offset-2')}>{DISTRICTS[v].name}</span>
                  </span>
                ))}
                <span className="ml-auto font-mono text-[10px] text-fg-subtle">{r.path.length - 1} hop{r.path.length > 2 ? 's' : ''}</span>
              </span>
            ) : (
              <span>{DISTRICTS[r.from].name}: every reachable district is hot.</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Rules: compiled IMD criteria ────────────────────────────────────────────────────────────────────────────────────
export function RulesPanel({ c }: { c: ConsoleState }) {
  const { snapshot: s } = c;
  const rules = compiledRules();
  const evals = useMemo(() => s.rows.map((r) => ({ r, lvl: ruleLevel(r) })), [s]);
  const agree = evals.filter((e) => e.lvl === e.r.status.level).length;
  const sel = c.selected ?? c.intel.ranking[0];
  const row = s.rows[sel];
  const coastal = DISTRICTS[sel].coastal;
  const selRank = LEVELS[ruleLevel(row)].rank;
  const need = { severe: 3, heatwave: 2, watch: 1 } as const;
  return (
    <div>
      <PanelHeader exp="EXP 03 · Stack" title="Rule compiler">
        IMD criteria compiled from infix to postfix with a linked stack, then evaluated per district. Agreement with the reference classifier: {agree}/36.
      </PanelHeader>
      {(['severe', 'heatwave', 'watch'] as const).map((k) => (
        <div key={k} className="mb-3 rounded-2xl border border-line bg-white/[0.02] p-3">
          <p className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
            {k} · {coastal ? 'coastal' : 'plains'}
            <span className={cn('rounded-full px-2 py-0.5', selRank >= need[k] ? 'bg-cloud text-midnight' : 'bg-white/5 text-fg-subtle')}>
              {selRank >= need[k] ? `fires for ${DISTRICTS[sel].name}` : 'does not fire'}
            </span>
          </p>
          <p className="mt-2 font-mono text-xs text-fg-muted">{IMD_RULES[coastal ? 'coastal' : 'plains'][k]}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {rules[coastal ? 'coastal' : 'plains'][k].map((t, i) => (
              <span key={i} className={cn('rounded border px-1.5 py-0.5 font-mono text-[10.5px]', t.type === 'op' ? 'border-silver/40 bg-silver/10 text-cloud' : 'border-line text-fg-muted')}>
                {t.text}
              </span>
            ))}
          </div>
          <p className="sr-only">postfix {tokensToString(rules[coastal ? 'coastal' : 'plains'][k])}</p>
        </div>
      ))}
      <p className="mt-4 text-xs text-fg-muted">
        Evaluated for <span className="text-cloud">{DISTRICTS[sel].name}</span> with tmax = {row.tmax.toFixed(1)}, dep ={' '}
        {row.status.departure == null ? 'n/a (outside season)' : fmtSigned(row.status.departure)} → <LevelChip level={ruleLevel(row)} />
      </p>
      <div className="mt-5 overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.04] font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
            <tr>
              <th className="px-3 py-2 font-normal">District</th>
              <th className="px-3 py-2 font-normal">Tmax</th>
              <th className="px-3 py-2 font-normal">Dep</th>
              <th className="px-3 py-2 font-normal">Rules</th>
            </tr>
          </thead>
          <tbody>
            {evals
              .filter((e) => e.lvl !== 'green')
              .sort((a, b) => LEVELS[b.lvl].rank - LEVELS[a.lvl].rank || b.r.tmax - a.r.tmax)
              .map(({ r, lvl }) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-1.5 text-cloud">{DISTRICTS[r.id].name}</td>
                  <td className="px-3 py-1.5 font-mono tabular text-fg-muted">{r.tmax.toFixed(1)}</td>
                  <td className="px-3 py-1.5 font-mono tabular text-fg-muted">{r.status.departure == null ? '—' : fmtSigned(r.status.departure)}</td>
                  <td className="px-3 py-1.5">
                    <LevelChip level={lvl} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sensors: circular queue ─────────────────────────────────────────────────────────────────────────────────────────
export function SensorsPanel({ c, live }: { c: ConsoleState; live: LiveState }) {
  const sel = c.selected ?? c.intel.ranking[0];
  const readings = useMemo(() => {
    if (c.effectiveMode === 'live' && live.status === 'ready') return live.payload.districts[sel].last24;
    return replayHourly(sel, c.snapshot.day, 24);
  }, [c.effectiveMode, live, sel, c.snapshot.day]);
  const { queue, stats } = useMemo(() => sensorRing(readings, 24), [readings]);
  const snap = queue.snapshot();
  const N = snap.capacity;
  return (
    <div>
      <PanelHeader exp="EXP 04 · Circular queue" title={`Sensor ring · ${DISTRICTS[sel].name}`}>
        The last 24 hourly readings ({c.effectiveMode === 'live' ? 'Open-Meteo, up to now' : 'ERA5, up to 14:00 IST'}). Each new hour overwrites the oldest slot in place.
      </PanelHeader>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <svg viewBox="0 0 220 220" className="size-56 shrink-0">
          {Array.from({ length: N }, (_, i) => {
            const v = snap.slots[i];
            const a0 = (i / N) * Math.PI * 2 - Math.PI / 2 + 0.018;
            const a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2 - 0.018;
            const r0 = 70, r1 = 104;
            const pt = (r: number, a: number) => `${(110 + r * Math.cos(a)).toFixed(2)},${(110 + r * Math.sin(a)).toFixed(2)}`;
            return (
              <path key={i} d={`M${pt(r1, a0)} A${r1},${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0},${r0} 0 0 0 ${pt(r0, a0)}Z`} fill={v ? heatHex(v.v) : '#233242'} stroke={i === snap.rear ? '#fff' : 'transparent'} strokeWidth={2}>
                <title>{v ? `slot ${i} · ${v.t} · ${v.v.toFixed(1)} °C` : `slot ${i} · empty`}</title>
              </path>
            );
          })}
          <text x="110" y="100" textAnchor="middle" className="fill-fg-subtle font-mono" fontSize="9" letterSpacing="1.5">
            24 H MAX
          </text>
          <text x="110" y="128" textAnchor="middle" className="fill-cloud font-wide" fontSize="28" fontWeight="900">
            {Number.isFinite(stats.max) ? `${stats.max.toFixed(1)}°` : '—'}
          </text>
        </svg>
        <dl className="grid w-full grid-cols-2 gap-2 font-mono text-xs">
          {[
            ['front', snap.front],
            ['rear', snap.rear],
            ['count', `${snap.count}/${N}`],
            ['mean', Number.isFinite(stats.mean) ? `${stats.mean.toFixed(1)} °C` : '—'],
            ['min', Number.isFinite(stats.min) ? `${stats.min.toFixed(1)} °C` : '—'],
            ['latest', readings.length ? `${readings[readings.length - 1].v.toFixed(1)} °C` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">{k}</dt>
              <dd className="mt-0.5 text-cloud tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-5 flex h-20 items-end gap-[3px]">
        {queue.toArray().map((r, i) => (
          <div key={i} className="flex-1 rounded-t-sm" title={`${r.t} · ${r.v.toFixed(1)} °C`} style={{ height: `${Math.max(6, ((r.v - 20) / 28) * 100)}%`, background: heatHex(r.v) }} />
        ))}
      </div>
      <p className="mt-1 flex justify-between font-mono text-[10px] text-fg-subtle">
        <span>{readings[0]?.t ?? ''}</span>
        <span>front → rear</span>
        <span>{readings[readings.length - 1]?.t ?? ''}</span>
      </p>
    </div>
  );
}

// ── Alerts: singly linked list ──────────────────────────────────────────────────────────────────────────────────────
export function AlertsPanel({ c }: { c: ConsoleState }) {
  const entries = useMemo(() => c.chain.entries(), [c.chain, c.chainVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const [target, setTarget] = useState<string | null>(null);
  const followUp = (id: string, b: Bulletin) => {
    const res = c.chain.insertAfter(id, {
      ...b,
      no: Math.max(...entries.map((e) => e.value.no)) + 1,
      text: `Follow-up to #${b.no}: ${DISTRICTS[b.district].name} remains at ${LEVELS[b.level].label.toLowerCase()}; review again at 17:00 IST.`,
    });
    if (res.result.ok) c.bumpChain();
  };
  const dropBefore = (id: string) => {
    const res = c.chain.deleteBefore(id);
    if (res.result.ok) c.bumpChain();
  };
  return (
    <div>
      <PanelHeader exp="EXP 02 · Singly linked list" title="Alert chain">
        Head = newest bulletin. Follow-ups are inserted right after the bulletin they update; “retire previous” deletes the node before the one you pick.
      </PanelHeader>
      {entries.length === 0 && <p className="text-sm text-fg-muted">No bulletins for this day — every district is below the watch thresholds.</p>}
      <ol className="space-y-2">
        <AnimatePresence initial={false}>
          {entries.map(({ id, value: b }, i) => (
            <motion.li
              key={id}
              layout
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.4, ease }}
              className={cn('rounded-2xl border p-3', target === id ? 'border-cloud/50 bg-white/[0.06]' : 'border-line bg-white/[0.02]')}
            >
              <button className="w-full text-left" onClick={() => setTarget(target === id ? null : id)} aria-expanded={target === id}>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-fg-subtle">#{b.no}</span>
                  <span className="flex-1 truncate text-sm text-cloud">{DISTRICTS[b.district].name}</span>
                  <LevelChip level={b.level} />
                  {i === 0 && <span className="font-mono text-[10px] text-fg-subtle">head</span>}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{b.text}</span>
              </button>
              {target === id && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={buttonClass('secondary', 'sm')} onClick={() => followUp(id, b)}>
                    <CornerDownRight className="size-3.5" aria-hidden /> Insert follow-up after
                  </button>
                  <button className={buttonClass('ghost', 'sm')} onClick={() => dropBefore(id)} disabled={i === 0}>
                    Retire previous (delete before)
                  </button>
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {entries.length > 0 && <p className="mt-3 pl-3 font-mono text-[10px] text-fg-subtle">→ null · {entries.length} nodes</p>}
    </div>
  );
}

// ── Advisory: human-in-the-loop ─────────────────────────────────────────────────────────────────────────────────────
export function AdvisoryPanel({ c }: { c: ConsoleState }) {
  const [aud, setAud] = useState<Audience>('citizens');
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const adv = useMemo(() => generateAdvisory(c.snapshot, c.intel, aud), [c.snapshot, c.intel, aud]);
  const key = `${c.snapshot.mode}:${c.snapshot.day}:${aud}`;
  const publish = () => {
    const entries = c.chain.entries();
    const no = entries.length ? Math.max(...entries.map((e) => e.value.no)) + 1 : 101;
    c.chain.insertAtBegin({
      no,
      district: adv.districts[0] ?? c.intel.ranking[0],
      level: adv.level,
      tmax: c.snapshot.rows[c.intel.ranking[0]].tmax,
      day: c.snapshot.day,
      text: `Approved ${AUDIENCES.find((a) => a.id === aud)!.label.toLowerCase()} advisory: ${adv.headline}.`,
    });
    c.bumpChain();
    setApproved((m) => ({ ...m, [key]: true }));
  };
  return (
    <div>
      <PanelHeader exp="Advisory engine · human in the loop" title="Stakeholder advisories">
        Drafted per audience from the analysis. Nothing is released until a person approves it — approved advisories are inserted at the head of the alert chain.
      </PanelHeader>
      <div role="tablist" aria-label="Audience" className="grid grid-cols-4 gap-1 rounded-full bg-white/[0.04] p-1">
        {AUDIENCES.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aud === a.id}
            onClick={() => setAud(a.id)}
            className={cn('rounded-full py-1.5 text-xs transition-colors', aud === a.id ? 'bg-cloud text-midnight' : 'text-fg-muted hover:text-cloud')}
          >
            {a.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.article
          key={key}
          role="tabpanel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease }}
          className="mt-4 rounded-2xl border border-line bg-white/[0.03] p-4"
        >
          <div className="flex items-start gap-2">
            <LevelDot level={adv.level} className="mt-1.5" />
            <h3 className="text-[15px] font-semibold leading-snug text-cloud">{adv.headline}</h3>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{adv.summary}</p>
          <ul className="mt-3 space-y-1.5">
            {adv.actions.map((a) => (
              <li key={a} className="flex gap-2 text-[13px] leading-relaxed text-fg-muted">
                <Check className="mt-0.5 size-3.5 shrink-0 text-silver" aria-hidden />
                {a}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-fg-subtle">{adv.footer}</p>
        </motion.article>
      </AnimatePresence>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {approved[key] ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-cloud/10 px-4 py-2 text-sm text-cloud">
            <ShieldCheck className="size-4" aria-hidden /> Approved · added to the alert chain
          </span>
        ) : (
          <button className={buttonClass('primary', 'md')} onClick={publish} disabled={adv.level === 'green'}>
            <Send className="size-4" aria-hidden /> Approve &amp; publish
          </button>
        )}
        <button className={buttonClass('ghost', 'md')} onClick={() => c.setTab('alerts')}>
          View alert chain
        </button>
      </div>
    </div>
  );
}

// ── Registry: array of structures + hash lookup ─────────────────────────────────────────────────────────────────────
export function RegistryPanel({ c }: { c: ConsoleState }) {
  const arr = useMemo(() => stationRegistry(c.snapshot), [c.snapshot]);
  const [q, setQ] = useState('');
  const result = useMemo(() => {
    if (!q.trim()) return null;
    const needle = q.trim().toLowerCase();
    return arr.search((st) => st.code.toLowerCase() === needle || st.name.toLowerCase().includes(needle), `“${q}”`).result;
  }, [arr, q]);
  const snap = arr.snapshot();
  return (
    <div>
      <PanelHeader exp="EXP 01 · Array of structures" title="Station registry">
        One fixed slot per district weather station ({snap.size}/{snap.capacity}). Linear search scans slot by slot.
      </PanelHeader>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by code (MH31) or name"
          className="h-10 w-full rounded-full border border-line-strong bg-white/[0.04] pl-9 pr-4 text-sm text-cloud placeholder:text-fg-subtle focus:border-silver/60 focus:outline-none"
        />
      </label>
      {result && (
        <p className="mt-2 font-mono text-[11px] text-fg-muted">
          {result.index >= 0 ? `found at slot [${result.index}]` : 'not found'} · {result.comparisons} comparison{result.comparisons === 1 ? '' : 's'}
        </p>
      )}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.04] font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
            <tr>
              <th className="px-3 py-2 font-normal">Slot</th>
              <th className="px-3 py-2 font-normal">Code</th>
              <th className="px-3 py-2 font-normal">Station</th>
              <th className="px-3 py-2 text-right font-normal">Tmax</th>
            </tr>
          </thead>
          <tbody>
            {snap.slots.map((st, i) =>
              st ? (
                <tr
                  key={i}
                  onClick={() => c.setSelected(st.id)}
                  className={cn('cursor-pointer border-t border-line transition-colors hover:bg-white/[0.04]', result?.index === i && 'bg-cloud/10', c.selected === st.id && 'bg-white/[0.06]')}
                >
                  <td className="px-3 py-1.5 font-mono text-fg-subtle">[{i}]</td>
                  <td className="px-3 py-1.5 font-mono text-fg-muted">{st.code}</td>
                  <td className="px-3 py-1.5 text-cloud">{st.name}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular text-cloud">{st.tmax.toFixed(1)}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Archive: sorting + binary search ────────────────────────────────────────────────────────────────────────────────
export function ArchivePanel({ c }: { c: ConsoleState }) {
  const [archive, setArchive] = useState<Archive | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    loadArchive().then((a) => alive && setArchive(a));
    return () => {
      alive = false;
    };
  }, []);
  const sel = c.selected ?? c.intel.ranking[0];
  const row = c.snapshot.rows[sel];
  const rank = useMemo(() => (archive && archive !== 'loading' ? rankAgainstHistory(archive, sel, row.tmax) : null), [archive, sel, row.tmax]);
  const top = useMemo(() => {
    if (!archive || archive === 'loading') return [];
    return c.intel.ranking.slice(0, 8).map((id) => ({ id, ...rankAgainstHistory(archive, id, c.snapshot.rows[id].tmax) }));
  }, [archive, c.intel.ranking, c.snapshot.rows]);
  return (
    <div>
      <PanelHeader exp="EXP 07 · Sorting + binary search" title="Climate archive">
        Each district’s 1,342 season days (1 Mar–30 Jun, 2015–2025) are merge-sorted once; binary search then ranks any temperature in O(log n).
      </PanelHeader>
      {archive === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading 48,312 ERA5 values…
        </p>
      )}
      {archive === null && <p className="text-sm text-fg-muted">The archive could not be loaded.</p>}
      {rank && (
        <>
          <div className="rounded-3xl bg-cloud p-5 text-midnight">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-midnight/60">
              {DISTRICTS[sel].name} · {fmtDay(c.snapshot.day)}
            </p>
            <p className="mt-2 font-wide text-4xl font-black tracking-[-0.03em] tabular">{rank.pct.toFixed(1)}%</p>
            <p className="mt-1 text-sm text-midnight/75">
              of season days since 2015 were cooler than today’s {row.tmax.toFixed(1)} °C. Only {rank.atOrAbove} of {rank.n} days were as hot or hotter.
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
            <div className="rounded-xl border border-line px-3 py-2">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Median day</dt>
              <dd className="mt-0.5 text-cloud">{rank.median.toFixed(1)} °C</dd>
            </div>
            <div className="rounded-xl border border-line px-3 py-2">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Archive max</dt>
              <dd className="mt-0.5 text-cloud">{rank.max.toFixed(1)} °C</dd>
            </div>
          </dl>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Hottest districts against their own history</p>
          <ul className="mt-2 space-y-1.5">
            {top.map((t) => (
              <li key={t.id} className="grid grid-cols-[1fr_6rem_3.2rem] items-center gap-2 text-xs">
                <span className="truncate text-cloud">{DISTRICTS[t.id].name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-cloud" style={{ width: `${t.pct}%` }} />
                </span>
                <span className="text-right font-mono tabular text-fg-muted">p{t.pct.toFixed(0)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 flex items-center gap-1.5 font-mono text-[10px] text-fg-subtle">
        <Database className="size-3" aria-hidden /> ERA5 reanalysis via Open-Meteo · CC BY 4.0
      </p>
    </div>
  );
}
