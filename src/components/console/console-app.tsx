'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Box, Layers2, Loader2, Map as MapIcon, Pause, Play, Search, Share2, X } from 'lucide-react';
import { LogoMark } from '@/components/brand/logo';
import { DistrictSvgMap } from '@/components/map/district-svg-map';
import { setTier, useTier } from '@/components/three/perf';
import { LevelChip, LevelDot } from '@/components/ui/primitives';
import { DISTRICTS, REPLAY_WINDOW, replaySnapshot, summarize } from '@/lib/data';
import { districtGraph, lookup, lookupTable, stationCode } from '@/lib/engine';
import { HEAT_RAMP_CSS, LEVELS, heatHex } from '@/lib/heat';
import { cn, fmtC, fmtDay, fmtSigned } from '@/lib/utils';
import { AdvisoryPanel, AlertsPanel, ArchivePanel, HotspotsPanel, RegistryPanel, RulesPanel, SensorsPanel, SpreadPanel } from './panels';
import { useConsole, type Mode, type Tab } from './use-console';

const HeatMap3D = dynamic(() => import('@/components/three/heat-map-3d'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-sm text-fg-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
    </div>
  ),
});

const TABS: { id: Tab; label: string; exp: string }[] = [
  { id: 'hotspots', label: 'Hotspots', exp: 'BST' },
  { id: 'spread', label: 'Spread', exp: 'BFS' },
  { id: 'rules', label: 'Rules', exp: 'Stack' },
  { id: 'sensors', label: 'Sensors', exp: 'Ring' },
  { id: 'alerts', label: 'Alerts', exp: 'SLL' },
  { id: 'advisory', label: 'Advisory', exp: 'HITL' },
  { id: 'registry', label: 'Registry', exp: 'Array' },
  { id: 'archive', label: 'Archive', exp: 'Sort' },
];

// how many districts were at or above 40 °C on each replay day (timeline sparkline)
const SPARK = REPLAY_WINDOW.map((d) => summarize(replaySnapshot(d)).atOrAbove40);

export function ConsoleApp({ initialMode }: { initialMode: Mode }) {
  const c = useConsole(initialMode);
  const tier = useTier();
  const [viewChoice, setView] = useState<'3d' | '2d'>('3d');
  const view = tier === 'off' ? '2d' : viewChoice;
  const [graph, setGraph] = useState(true);

  const { snapshot: s, intel } = c;
  const sum = useMemo(() => summarize(s), [s]);
  const data = useMemo(() => s.rows.map((r) => ({ tmax: r.tmax, level: r.status.level })), [s]);
  const focus = c.selected ?? intel.ranking[0];
  const bfs = useMemo(() => {
    const b = districtGraph().bfs(focus, { maxSteps: 0 }).result;
    return { level: b.level, parent: b.parent, source: focus, order: b.order };
  }, [focus]);
  const labels = useMemo(() => (c.selected != null ? [c.selected] : intel.ranking.slice(0, 3)), [c.selected, intel.ranking]);

  const liveBusy = c.mode === 'live' && c.live.status === 'loading';
  const liveFailed = c.mode === 'live' && c.live.status === 'error';

  return (
    <div className="flex min-h-dvh flex-col bg-abyss lg:h-dvh lg:overflow-hidden">
      {/* top bar */}
      <header className="z-30 flex flex-wrap items-center gap-3 border-b border-line bg-abyss px-3 py-2.5 sm:px-5">
        <Link href="/" className="flex items-center gap-2 rounded-full pr-2" aria-label="HEATSYNC home">
          <LogoMark className="size-7 text-cloud" />
          <span className="font-wide text-sm font-black tracking-[0.04em] text-cloud">HEATSYNC</span>
          <span className="hidden rounded-full border border-line-strong px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-fg-subtle sm:inline">Console</span>
        </Link>
        <div role="radiogroup" aria-label="Data mode" className="ml-auto flex rounded-full bg-white/[0.05] p-1 lg:ml-6">
          {(['replay', 'live'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={c.mode === m}
              onClick={() => {
                c.setMode(m);
                c.setPlaying(false);
              }}
              className={cn('relative rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors', c.mode === m ? 'text-midnight' : 'text-fg-muted hover:text-cloud')}
            >
              {c.mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-cloud" transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }} />}
              <span className="relative">{m === 'replay' ? 'Replay · May 2024' : 'Live · today'}</span>
            </button>
          ))}
        </div>
        <LookupBox onPick={(id) => c.setSelected(id)} />
        <Link href="/lab" className="hidden rounded-full px-3 py-2 text-xs text-fg-muted hover:bg-white/5 hover:text-cloud xl:inline">
          DSA lab
        </Link>
      </header>

      <div className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] sm:p-4">
        {/* map */}
        <section aria-label="Map" className="relative min-h-[62svh] overflow-hidden rounded-[28px] border border-line bg-abyss lg:min-h-0">
          <div className="absolute inset-0">
            {view === '3d' && tier && tier !== 'off' ? (
              <HeatMap3D
                data={data}
                tier={tier}
                variant="console"
                selected={c.selected}
                onSelect={(id) => c.setSelected(id === c.selected ? null : id)}
                bfs={bfs}
                emphasis={c.emphasis}
                showGraph={graph}
                labels={labels}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center p-6 pb-28 pt-24">
                <DistrictSvgMap
                  data={data}
                  selected={c.selected}
                  onSelect={(id) => c.setSelected(id === c.selected ? null : id)}
                  highlight={c.emphasis}
                  showGraph={graph}
                  className="max-h-full w-auto max-w-full"
                  nodeFill={(id) => (bfs.level[id] === 0 ? '#ffffff' : bfs.level[id] === 1 ? '#bdc3c7' : '#6f808f')}
                />
              </div>
            )}
          </div>

          {/* overlay: day + KPIs */}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
            <div className="glass-strong pointer-events-auto rounded-2xl px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
                {s.mode === 'replay' ? 'Historical replay · ERA5' : 'Live guidance · Open-Meteo'}
                {liveBusy && ' · loading live…'}
                {liveFailed && ' · live unavailable, showing replay'}
              </p>
              <p className="mt-0.5 font-wide text-xl font-black tracking-[-0.02em] text-cloud">{fmtDay(s.day)}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="text-fg-muted">
                  Hottest <span className="font-mono text-cloud">{sum.max.tmax.toFixed(1)}°</span> {DISTRICTS[sum.max.id].name}
                </span>
                <span className="text-fg-muted">
                  ≥ 40 °C <span className="font-mono text-cloud">{sum.atOrAbove40}</span>
                </span>
                <span className="text-fg-muted">
                  Zones <span className="font-mono text-cloud">{intel.clusters.length}</span>
                </span>
              </div>
            </div>
            <div className="pointer-events-auto flex items-center gap-1.5">
              <div className="glass flex rounded-full p-1">
                <IconToggle on={view === '3d'} label="3D view" onClick={() => tier !== 'off' && setView('3d')} disabled={tier === 'off'}>
                  <Box className="size-4" />
                </IconToggle>
                <IconToggle on={view === '2d'} label="2D view" onClick={() => setView('2d')}>
                  <MapIcon className="size-4" />
                </IconToggle>
              </div>
              <div className="glass flex rounded-full p-1">
                <IconToggle on={graph} label="Border graph" onClick={() => setGraph((g) => !g)}>
                  <Share2 className="size-4" />
                </IconToggle>
                <IconToggle
                  on={tier === 'low'}
                  label="Lite rendering"
                  onClick={() => {
                    setTier(tier === 'low' ? 'high' : 'low');
                  }}
                  disabled={tier === 'off'}
                >
                  <Layers2 className="size-4" />
                </IconToggle>
              </div>
            </div>
          </div>

          {/* legend */}
          <div className="pointer-events-none absolute right-4 top-20 hidden w-44 md:block">
            <div className="glass rounded-2xl p-3">
              <div className="h-1.5 rounded-full" style={{ background: HEAT_RAMP_CSS }} />
              <div className="mt-1 flex justify-between font-mono text-[9.5px] text-fg-subtle">
                <span>28°</span>
                <span>38°</span>
                <span>47°+</span>
              </div>
              <ul className="mt-2 space-y-1">
                {(['red', 'orange', 'yellow', 'green'] as const).map((l) => (
                  <li key={l} className="flex items-center justify-between text-[11px] text-fg-muted">
                    <span className="flex items-center gap-1.5">
                      <LevelDot level={l} className="size-1.5" /> {LEVELS[l].label}
                    </span>
                    <span className="font-mono text-cloud">{sum.counts[l]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* selected district */}
          <AnimatePresence>
            {c.selected != null && <DistrictCard key={c.selected} id={c.selected} c={c} onClose={() => c.setSelected(null)} />}
          </AnimatePresence>

          {/* timeline */}
          <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4">
            <div className="glass-strong flex items-center gap-3 rounded-2xl px-3 py-2.5">
              {s.mode === 'replay' ? (
                <>
                  <button
                    onClick={() => {
                      if (!c.playing && c.replayDay === REPLAY_WINDOW[REPLAY_WINDOW.length - 1]) c.setReplayDay(REPLAY_WINDOW[0]);
                      c.setPlaying(!c.playing);
                    }}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-cloud text-midnight transition-transform active:scale-95"
                    aria-label={c.playing ? 'Pause replay' : 'Play replay'}
                  >
                    {c.playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
                  </button>
                  <div className="flex min-w-0 flex-1 items-end gap-[3px] overflow-x-auto scrollbar-none" role="radiogroup" aria-label="Replay day">
                    {REPLAY_WINDOW.map((d, i) => {
                      const on = d === c.replayDay;
                      return (
                        <button
                          key={d}
                          role="radio"
                          aria-checked={on}
                          aria-label={`${fmtDay(d)}: ${SPARK[i]} districts at or above 40 °C`}
                          onClick={() => {
                            c.setPlaying(false);
                            c.setReplayDay(d);
                          }}
                          className="group flex min-w-[1.7rem] flex-1 flex-col items-center gap-1"
                        >
                          <span className="flex h-9 w-full items-end">
                            <span
                              className={cn('w-full rounded-t-[3px] transition-colors', on ? 'bg-cloud' : 'bg-silver/25 group-hover:bg-silver/50')}
                              style={{ height: `${Math.max(10, (SPARK[i] / 24) * 100)}%` }}
                            />
                          </span>
                          <span className={cn('font-mono text-[9.5px] tabular', on ? 'text-cloud' : 'text-fg-subtle')}>{d.slice(8)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="hidden shrink-0 text-right font-mono text-[10px] leading-tight text-fg-subtle sm:block">
                    bars = districts
                    <br />≥ 40 °C · May
                  </span>
                </>
              ) : (
                <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-none" role="radiogroup" aria-label="Forecast day">
                  {c.live.status === 'ready' &&
                    c.live.payload.days.map((d, i) => (
                      <button
                        key={d}
                        role="radio"
                        aria-checked={c.liveDay === i}
                        onClick={() => c.setLiveDay(i)}
                        className={cn('shrink-0 rounded-xl px-3 py-1.5 text-left transition-colors', c.liveDay === i ? 'bg-cloud text-midnight' : 'bg-white/[0.04] text-fg-muted hover:text-cloud')}
                      >
                        <span className="block font-mono text-[9.5px] uppercase tracking-[0.12em] opacity-70">{i === 0 ? 'Today' : `+${i}d`}</span>
                        <span className="text-xs font-medium">{fmtDay(d, false)}</span>
                      </button>
                    ))}
                  {c.live.status !== 'ready' && <span className="px-2 py-2 text-xs text-fg-muted">{liveBusy ? 'Loading forecast…' : 'Live feed unavailable — showing the replay.'}</span>}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* panels */}
        <section aria-label="Modules" className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-line bg-night/60">
          <div role="tablist" aria-label="Modules" className="flex gap-1 overflow-x-auto border-b border-line p-2 scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={c.tab === t.id}
                onClick={() => c.setTab(t.id)}
                className={cn('relative shrink-0 rounded-xl px-3 py-2 text-left transition-colors', c.tab === t.id ? 'text-midnight' : 'text-fg-muted hover:bg-white/[0.04] hover:text-cloud')}
              >
                {c.tab === t.id && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-xl bg-cloud" transition={{ type: 'spring', bounce: 0.12, duration: 0.45 }} />}
                <span className="relative block text-xs font-semibold">{t.label}</span>
                <span className="relative block font-mono text-[9px] uppercase tracking-[0.14em] opacity-60">{t.exp}</span>
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-5" data-lenis-prevent role="tabpanel">
            <AnimatePresence mode="wait">
              <motion.div key={c.tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                {c.tab === 'hotspots' && <HotspotsPanel c={c} />}
                {c.tab === 'spread' && <SpreadPanel c={c} />}
                {c.tab === 'rules' && <RulesPanel c={c} />}
                {c.tab === 'sensors' && <SensorsPanel c={c} live={c.live} />}
                {c.tab === 'alerts' && <AlertsPanel c={c} />}
                {c.tab === 'advisory' && <AdvisoryPanel c={c} />}
                {c.tab === 'registry' && <RegistryPanel c={c} />}
                {c.tab === 'archive' && <ArchivePanel c={c} />}
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="border-t border-line px-4 py-2.5 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.12em] text-fg-subtle">
            Decision-support prototype · not an official IMD warning · {s.source}
          </p>
        </section>
      </div>
    </div>
  );
}

function IconToggle({ on, label, onClick, children, disabled }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('grid size-8 place-items-center rounded-full transition-colors disabled:opacity-40', on ? 'bg-cloud text-midnight' : 'text-fg-muted hover:text-cloud')}
    >
      {children}
    </button>
  );
}

function DistrictCard({ id, c, onClose }: { id: number; c: ReturnType<typeof useConsole>; onClose: () => void }) {
  const d = DISTRICTS[id];
  const r = c.snapshot.rows[id];
  const rank = c.intel.ranking.indexOf(id) + 1;
  return (
    <motion.aside
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="glass-strong absolute bottom-24 left-3 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-3xl p-4 sm:left-4"
      aria-label={`${d.name} details`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
            {stationCode(id)} · {d.subdivision}
            {d.coastal ? ' · coastal' : ''}
          </p>
          <h3 className="mt-1 font-wide text-xl font-black tracking-[-0.02em] text-cloud">{d.name}</h3>
        </div>
        <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-white/10 hover:text-cloud" aria-label="Close details">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <p className="font-wide text-4xl font-black leading-none tracking-[-0.04em] tabular" style={{ color: heatHex(Math.max(r.tmax, 41)) }}>
          {r.tmax.toFixed(1)}°
        </p>
        <div className="pb-1">
          <LevelChip level={r.status.level} />
          <p className="mt-1 font-mono text-[10px] text-fg-subtle">rank {rank}/36</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{r.status.reason}.</p>
      <dl className="mt-3 grid grid-cols-4 gap-2 font-mono text-[11px]">
        {[
          ['Normal', r.normal == null ? '—' : r.normal.toFixed(1)],
          ['Dep.', r.status.departure == null ? '—' : fmtSigned(r.status.departure)],
          ['Feels', r.feels == null ? '—' : r.feels.toFixed(1)],
          ['RH %', r.rh ?? '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/[0.04] px-2 py-1.5">
            <dt className="text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">{k}</dt>
            <dd className="text-cloud">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
        Borders {d.neighbors.map((n) => DISTRICTS[n].name).join(', ')} · HQ PIN {d.hqPin} · feels-like {fmtC(r.feels)}
      </p>
    </motion.aside>
  );
}

/** Search box backed by the hash-table dictionary (names, former names, station codes, HQ PINs). */
function LookupBox({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    const seen = new Set<number>();
    return lookupTable()
      .entries()
      .filter((e) => e.key.includes(n))
      .sort((a, b) => Number(!a.key.startsWith(n)) - Number(!b.key.startsWith(n)) || a.key.length - b.key.length)
      .filter((e) => (seen.has(e.value) ? false : (seen.add(e.value), true)))
      .slice(0, 6);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (query: string) => {
    const hit = lookup(query);
    if (hit) {
      onPick(hit.id);
      setHint(hit.exact ? `${DISTRICTS[hit.id].name} · hash hit in ${hit.probes} probe${hit.probes === 1 ? '' : 's'}` : `${DISTRICTS[hit.id].name} · prefix match`);
      setQ('');
      setOpen(false);
    } else setHint('No district, former name, code or PIN matches');
  };

  return (
    <div ref={box} className="relative order-last w-full sm:order-none sm:w-72">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pick(q);
        }}
      >
        <label className="relative block">
          <span className="sr-only">Find a district</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setHint(null);
            }}
            onFocus={() => setOpen(true)}
            placeholder="District, old name, PIN (440001)…"
            className="h-9 w-full rounded-full border border-line-strong bg-white/[0.04] pl-9 pr-3 text-sm text-cloud placeholder:text-fg-subtle focus:border-silver/60 focus:outline-none"
          />
        </label>
      </form>
      <AnimatePresence>
        {(open && suggestions.length > 0) || hint ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="glass-strong absolute inset-x-0 top-11 z-40 rounded-2xl p-1.5"
          >
            {open &&
              suggestions.map((s) => (
                <button key={s.key} onClick={() => pick(s.key)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-cloud hover:bg-white/[0.06]">
                  <span>{DISTRICTS[s.value].name}</span>
                  <span className="font-mono text-[10px] text-fg-subtle">
                    {s.key} · slot {s.slot}
                  </span>
                </button>
              ))}
            {hint && !(open && suggestions.length) && <p className="px-3 py-2 font-mono text-[11px] text-fg-muted">{hint}</p>}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
