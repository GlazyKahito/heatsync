'use client';

import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { DISTRICTS, REPLAY_DEFAULT, REPLAY_SOURCE } from '@/lib/data';
import { heatHex } from '@/lib/heat';
import { cn, fmtDay } from '@/lib/utils';
import { daySummaries } from './model';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

/** Replay-day selector shared by all experiments: a radio strip with each day's count of districts at 40 °C or more. */
export function DayPicker({ day, onChange }: { day: string; onChange: (iso: string) => void }) {
  const days = useMemo(() => daySummaries(), []);
  const listRef = useRef<HTMLDivElement>(null);
  const i = Math.max(0, days.findIndex((d) => d.day === day));
  const cur = days[i];
  const maxHot = Math.max(...days.map((d) => d.hot), 1);

  // keep the selected day visible when the strip scrolls (narrow screens)
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: Math.max(0, el.offsetLeft - list.clientWidth / 2 + el.offsetWidth / 2), behavior: 'smooth' });
  }, [day]);

  const go = (k: number, focus = false) => {
    const next = days[Math.min(days.length - 1, Math.max(0, k))];
    if (!next) return;
    if (next.day !== day) onChange(next.day);
    if (focus) listRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next.day}"]`)?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: days.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    go(map[e.key], true);
  };

  return (
    <div className="glass-strong relative overflow-hidden rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex items-start justify-between gap-4 lg:w-80 lg:shrink-0 lg:flex-col lg:justify-start">
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-subtle">Replay day · feeds every experiment</p>
            <p className="mt-1.5 font-wide text-2xl font-black tracking-[-0.02em] text-cloud sm:text-3xl">{fmtDay(cur.day)}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
              <span className="text-cloud tabular">{cur.hot}</span> of 36 districts ≥ 40 °C · <span className="text-cloud tabular">{cur.heatwave}</span> in heatwave
              <br />
              hottest {DISTRICTS[cur.maxId].name} <span className="text-cloud tabular">{cur.maxT.toFixed(1)} °C</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 lg:mt-1">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous day" className="grid size-9 place-items-center rounded-full border border-line-strong text-fg-muted transition-colors hover:text-cloud disabled:opacity-35">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => go(i + 1)} disabled={i === days.length - 1} aria-label="Next day" className="grid size-9 place-items-center rounded-full border border-line-strong text-fg-muted transition-colors hover:text-cloud disabled:opacity-35">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={listRef}
            role="radiogroup"
            aria-label="Replay day, May 2024"
            onKeyDown={onKeyDown}
            className="scrollbar-none relative flex gap-1 overflow-x-auto pb-1 pt-6"
          >
            {days.map((d, k) => {
              const on = d.day === day;
              const h = 10 + (d.hot / maxHot) * 46;
              return (
                <button
                  key={d.day}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  data-day={d.day}
                  onClick={() => go(k)}
                  aria-label={`${fmtDay(d.day)}: ${d.hot} districts at or above 40 °C, hottest ${DISTRICTS[d.maxId].name} ${d.maxT.toFixed(1)} °C`}
                  className={cn(
                    'group relative flex min-w-[2.6rem] flex-1 flex-col items-center gap-1.5 rounded-2xl px-1 pb-2 pt-2 transition-colors',
                    on ? 'bg-cloud text-midnight' : 'text-fg-muted hover:bg-white/[0.05] hover:text-cloud',
                  )}
                >
                  {d.day === REPLAY_DEFAULT && (
                    <span className={cn('absolute -top-5 inline-flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-[0.12em]', on ? 'text-cloud' : 'text-fg-subtle')}>
                      <Flame className="size-2.5" aria-hidden /> peak
                    </span>
                  )}
                  <span className={cn('font-mono text-[9px] tabular', on ? 'text-midnight/60' : 'text-fg-subtle')}>{d.hot}</span>
                  <span className="flex h-14 items-end" aria-hidden>
                    <motion.span className="block w-2 rounded-full" initial={false} animate={{ height: h }} style={{ background: on ? '#2c3d50' : heatHex(d.maxT) }} />
                  </span>
                  <span className="font-wide text-sm font-black leading-none tabular">{d.day.slice(8)}</span>
                  <span className={cn('font-mono text-[9px] uppercase', on ? 'text-midnight/70' : 'text-fg-subtle')}>{weekday(d.day)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
            May 2024 · bar height = districts ≥ 40 °C, colour = day’s hottest reading · {REPLAY_SOURCE}
          </p>
        </div>
      </div>
    </div>
  );
}
