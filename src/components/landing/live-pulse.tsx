'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CloudSun, Loader2, WifiOff } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { buttonClass, LevelChip } from '@/components/ui/primitives';
import { DISTRICTS, seasonIndex, summarize } from '@/lib/data';
import { analyse } from '@/lib/engine';
import { liveSnapshot, useLive } from '@/lib/live';
import { heatHex } from '@/lib/heat';
import { cn, fmtDay } from '@/lib/utils';
import { SectionHeading } from './sections';

/** Live section: today's Open-Meteo guidance for all 36 districts, run through the same engine as the replay. */
export function LivePulse() {
  const live = useLive();
  const view = useMemo(() => {
    if (live.status !== 'ready') return null;
    const s = liveSnapshot(live.payload, 0);
    return { s, sum: summarize(s), intel: analyse(s), payload: live.payload };
  }, [live]);

  const inSeason = view ? seasonIndex(view.s.day) >= 0 : true;

  return (
    <Reveal as="section" id="live" aria-labelledby="live-title" className="relative scroll-mt-20 overflow-hidden py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading eyebrow="04 · Live pulse" title="Today, through the same engine." id="live-title">
            <p>Open-Meteo’s forecast for each district, refreshed every 30 minutes and ranked, clustered and classified exactly like the replay.</p>
          </SectionHeading>
          <Link data-reveal href="/console?mode=live" className={buttonClass('secondary', 'md', 'group')}>
            Live console <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* marquee */}
      <div data-reveal className="mask-fade-x relative mt-14 overflow-hidden" aria-label="Today’s maximum temperature by district">
        {view ? (
          <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
            {[0, 1].map((dup) => (
              <ul key={dup} className="flex gap-3" aria-hidden={dup === 1}>
                {view.intel.ranking.map((id) => {
                  const r = view.s.rows[id];
                  return (
                    <li key={id} className="glass flex shrink-0 items-center gap-3 rounded-full py-2 pl-2 pr-4">
                      <span className="size-7 rounded-full" style={{ background: heatHex(r.tmax) }} aria-hidden />
                      <span className="text-sm text-cloud">{DISTRICTS[id].name}</span>
                      <span className="font-mono text-sm text-silver tabular">{r.tmax.toFixed(1)}°</span>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        ) : (
          <div className="flex h-12 items-center justify-center gap-2 text-sm text-fg-muted">
            {live.status === 'loading' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Fetching today’s guidance…
              </>
            ) : (
              <>
                <WifiOff className="size-4" aria-hidden /> The live feed is unavailable right now — the replay still works everywhere.
              </>
            )}
          </div>
        )}
      </div>

      {view && (
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          <div data-reveal className="rounded-3xl bg-cloud p-7 text-midnight">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-midnight/60">Hottest today · {fmtDay(view.s.day)}</p>
            <p className="mt-3 font-wide text-5xl font-black tracking-[-0.04em] tabular">{view.sum.max.tmax.toFixed(1)}°</p>
            <p className="mt-1 text-sm text-midnight/75">{DISTRICTS[view.sum.max.id].name}</p>
          </div>
          <div data-reveal className="rounded-3xl border border-line bg-asphalt p-7">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">Warning levels</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {(['red', 'orange', 'yellow', 'green'] as const).map((l) => (
                <li key={l} className="flex items-center gap-2">
                  <LevelChip level={l} />
                  <span className="font-mono text-sm text-cloud tabular">{view.sum.counts[l]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-fg-muted">
              {view.intel.clusters.length} contiguous hot zone{view.intel.clusters.length === 1 ? '' : 's'} · {view.sum.atOrAbove40} district{view.sum.atOrAbove40 === 1 ? '' : 's'} ≥ 40 °C
            </p>
          </div>
          <div data-reveal className={cn('rounded-3xl border border-line p-7', inSeason ? 'bg-midnight' : 'bg-midnight')}>
            <CloudSun className="size-5 text-silver" aria-hidden />
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              {inSeason
                ? 'Departures are measured against the ERA5 2015–2024 normal for this calendar window.'
                : 'Outside the March–June heat season no normal is defined, so only the absolute thresholds apply today — expect a quiet map.'}
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
              Open-Meteo · fetched {new Date(view.payload.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
            </p>
          </div>
        </div>
      )}
    </Reveal>
  );
}
