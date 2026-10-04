'use client';

import { useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Check, X } from 'lucide-react';
import { DistrictSvgMap } from '@/components/map/district-svg-map';
import { Eyebrow, LevelChip, LevelDot } from '@/components/ui/primitives';
import { AUDIENCES, generateAdvisory, type Audience } from '@/lib/advisory';
import { DISTRICTS, REPLAY_DEFAULT, replayHourly, replaySnapshot } from '@/lib/data';
import { alertChain, analyse, compiledRules, ruleLevel, sensorRing } from '@/lib/engine';
import { tokensToString } from '@/lib/ds/stack';
import { IMD_RULES, heatHex } from '@/lib/heat';
import { cn, fmtDay, fmtSigned } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * "How an alert travels": six panels on a pinned horizontal track (vertical stack on phones). Every number is
 * computed live in the browser by the engine on the 26 May 2024 replay.
 */
export function PipelineSection() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [aud, setAud] = useState<Audience>('citizens');

  const m = useMemo(() => {
    const s = replaySnapshot(REPLAY_DEFAULT);
    const intel = analyse(s);
    const focus = intel.ranking[0];
    const ring = sensorRing(replayHourly(focus, s.day, 24));
    const row = s.rows[focus];
    const rules = compiledRules();
    const chain = alertChain(s).toArray();
    const agree = s.rows.filter((r) => ruleLevel(r) === r.status.level).length;
    return { s, intel, focus, ring, row, rules, chain, agree };
  }, []);
  const advisory = useMemo(() => generateAdvisory(m.s, m.intel, aud), [m, aud]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const el = track.current!;
        const dist = () => el.scrollWidth - window.innerWidth + 48;
        const tween = gsap.to(el, {
          x: () => -dist(),
          ease: 'none',
          scrollTrigger: { trigger: root.current, pin: true, scrub: 0.9, start: 'top top', end: () => `+=${dist()}`, invalidateOnRefresh: true, anticipatePin: 1 },
        });
        gsap.utils.toArray<HTMLElement>('[data-panel]').forEach((p) => {
          gsap.fromTo(
            p.querySelectorAll('[data-panel-in]'),
            { autoAlpha: 0, y: 30 },
            { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left 78%', once: true } },
          );
        });
        gsap.fromTo('[data-progress]', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top top', end: () => `+=${dist()}`, scrub: true } });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const nagpurName = DISTRICTS[m.focus].name;
  const dep = m.row.normal == null ? null : m.row.tmax - m.row.normal;
  const N = m.ring.queue.capacity;
  const slots = m.ring.queue.snapshot();
  const ringStats = m.ring.stats;
  const clusterSet = new Set(m.intel.clusters[0] ?? []);

  const panels = [
    {
      k: 'Sense',
      exp: 'EXP 04 · Circular queue',
      title: 'A rolling day, held in 24 slots.',
      body: `${nagpurName}’s last 24 hourly readings up to 14:00. Each new hour overwrites the oldest in place — the rolling maximum never needs a re-read.`,
      viz: (
        <div className="flex items-center gap-6">
          <svg viewBox="0 0 200 200" className="size-48 shrink-0">
            {Array.from({ length: N }, (_, i) => {
              const v = slots.slots[i];
              const a0 = (i / N) * Math.PI * 2 - Math.PI / 2 + 0.02;
              const a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2 - 0.02;
              const r0 = 62, r1 = 92;
              const pt = (r: number, a: number) => `${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`;
              return (
                <path key={i} d={`M${pt(r1, a0)} A${r1},${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0},${r0} 0 0 0 ${pt(r0, a0)}Z`} fill={v ? heatHex(v.v) : '#233242'} stroke={i === slots.rear ? '#fff' : 'none'} strokeWidth={2}>
                  <title>{v ? `${v.t} · ${v.v.toFixed(1)} °C` : 'empty'}</title>
                </path>
              );
            })}
            <text x="100" y="94" textAnchor="middle" className="fill-fg-subtle font-mono" fontSize="10">
              ROLLING MAX
            </text>
            <text x="100" y="118" textAnchor="middle" className="fill-cloud font-wide" fontSize="24" fontWeight="900">
              {ringStats.max.toFixed(1)}°
            </text>
          </svg>
          <dl className="grid gap-2 font-mono text-xs">
            <div><dt className="text-fg-subtle">front / rear</dt><dd className="text-cloud">{slots.front} / {slots.rear}</dd></div>
            <div><dt className="text-fg-subtle">count</dt><dd className="text-cloud">{slots.count} / {N}</dd></div>
            <div><dt className="text-fg-subtle">mean</dt><dd className="text-cloud">{ringStats.mean.toFixed(1)} °C</dd></div>
            <div><dt className="text-fg-subtle">min</dt><dd className="text-cloud">{ringStats.min.toFixed(1)} °C</dd></div>
          </dl>
        </div>
      ),
    },
    {
      k: 'Judge',
      exp: 'EXP 03 · Stack',
      title: 'IMD criteria, compiled.',
      body: 'The heatwave rule is written the way a meteorologist reads it, converted to postfix with a stack, then evaluated for every district.',
      viz: (
        <div className="space-y-4 font-mono text-xs">
          <p className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-fg-muted">{IMD_RULES.plains.heatwave}</p>
          <div className="flex flex-wrap gap-1.5">
            {m.rules.plains.heatwave.map((t, i) => (
              <span key={i} className={cn('rounded-md border px-2 py-1', t.type === 'op' ? 'border-silver/40 bg-silver/10 text-cloud' : 'border-line text-fg-muted')}>
                {t.text}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.04] p-3">
            <span className="text-fg-subtle">{nagpurName}:</span>
            <span className="text-cloud">tmax {m.row.tmax.toFixed(1)}</span>
            <span className="text-cloud">dep {dep == null ? 'n/a' : fmtSigned(dep)}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-cloud">
              {m.row.status.level === 'orange' || m.row.status.level === 'red' ? <Check className="size-3.5" /> : <X className="size-3.5" />} fires
            </span>
          </div>
          <p className="text-fg-subtle">Compiled rules agree with the reference classifier for {m.agree}/36 districts.</p>
          <p className="sr-only">Postfix: {tokensToString(m.rules.plains.heatwave)}</p>
        </div>
      ),
    },
    {
      k: 'Rank',
      exp: 'EXP 05 · Binary search tree',
      title: 'The hottest, always in order.',
      body: `36 districts inserted by Tmax. A reverse in-order walk reads them hottest first — tree height ${m.intel.bstHeight}, not 36.`,
      viz: (
        <ol className="space-y-2">
          {m.intel.ranking.slice(0, 6).map((id, i) => {
            const r = m.s.rows[id];
            return (
              <li key={id} className="grid grid-cols-[1.5rem_8rem_1fr_3.5rem] items-center gap-3 text-sm">
                <span className="font-mono text-[11px] text-fg-subtle">{i + 1}</span>
                <span className="truncate text-cloud">{DISTRICTS[id].name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-white/5">
                  <span className="block h-full rounded-full" style={{ width: `${((r.tmax - 36) / 10) * 100}%`, background: heatHex(r.tmax) }} />
                </span>
                <span className="text-right font-mono text-xs text-cloud tabular">{r.tmax.toFixed(1)}°</span>
              </li>
            );
          })}
        </ol>
      ),
    },
    {
      k: 'Spread',
      exp: 'EXP 06 · Graph + BFS',
      title: 'Heat zones, not heat dots.',
      body: `BFS over 77 shared borders groups hot districts into ${m.intel.clusters.length} contiguous zone${m.intel.clusters.length === 1 ? '' : 's'}; the largest spans ${clusterSet.size} districts.`,
      viz: (
        <div>
          <DistrictSvgMap data={m.s.rows.map((r) => ({ tmax: r.tmax, level: r.status.level }))} highlight={clusterSet} className="max-h-60" label="Largest contiguous hot zone" />
          <p className="mt-2 font-mono text-[11px] text-fg-subtle">
            Alert rings from {nagpurName}: {m.intel.rings.map((r) => r.length).join(' → ')} districts
          </p>
        </div>
      ),
    },
    {
      k: 'Chain',
      exp: 'EXP 02 · Singly linked list',
      title: 'Bulletins, newest first.',
      body: 'Every warning becomes a node inserted at the head. Follow-ups go right after the bulletin they update; nothing is copied or shifted.',
      viz: (
        <ol className="space-y-2">
          {m.chain.slice(0, 5).map((b, i) => (
            <li key={b.no} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2">
              <span className="font-mono text-[11px] text-fg-subtle">#{b.no}</span>
              <span className="flex-1 truncate text-sm text-cloud">{DISTRICTS[b.district].name}</span>
              <LevelChip level={b.level} />
              {i === 0 && <span className="font-mono text-[10px] text-fg-subtle">← head</span>}
            </li>
          ))}
          <li className="pl-3 font-mono text-[11px] text-fg-subtle">… {Math.max(0, m.chain.length - 5)} more → null</li>
        </ol>
      ),
    },
    {
      k: 'Speak',
      exp: 'Advisory engine',
      title: 'One forecast, four voices.',
      body: 'Drafts are generated per audience from the same analysis, and stay drafts until a person approves them.',
      viz: (
        <div>
          <div role="tablist" aria-label="Audience" className="flex flex-wrap gap-1.5">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={aud === a.id}
                onClick={() => setAud(a.id)}
                className={cn('rounded-full px-3 py-1.5 text-xs transition-colors', aud === a.id ? 'bg-cloud text-midnight' : 'bg-white/5 text-fg-muted hover:text-cloud')}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white/[0.03] p-4" role="tabpanel">
            <p className="flex items-center gap-2 text-sm font-semibold text-cloud">
              <LevelDot level={advisory.level} /> {advisory.headline}
            </p>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-fg-muted">
              {advisory.actions.slice(0, 3).map((a) => (
                <li key={a} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-silver" />
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Draft · awaiting approval</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section ref={root} id="pipeline" aria-labelledby="pipeline-title" className="relative scroll-mt-0 overflow-hidden py-24 lg:flex lg:h-svh lg:flex-col lg:justify-center lg:py-0">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>03 · How an alert travels</Eyebrow>
            <h2 id="pipeline-title" className="mt-4 font-wide text-[clamp(2rem,4.4vw,3.4rem)] font-black leading-[0.98] tracking-[-0.03em] text-cloud">
              From one reading to four advisories.
            </h2>
          </div>
          <p className="max-w-sm text-sm text-fg-muted">
            Computed in your browser on the {fmtDay(m.s.day)} replay — the same engine that runs the console.
          </p>
        </div>
        <div className="mt-6 hidden h-px w-full bg-line lg:block">
          <div data-progress className="h-px origin-left bg-cloud" />
        </div>
      </div>
      <div ref={track} className="mt-10 flex flex-col gap-4 px-4 sm:px-6 lg:mt-8 lg:w-max lg:flex-row lg:gap-5 lg:pl-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] lg:pr-24">
        {panels.map((p, i) => (
          <article key={p.k} data-panel className="glass relative flex flex-col rounded-[28px] p-6 sm:p-8 lg:h-[min(36rem,68svh)] lg:w-[min(34rem,80vw)]">
            <div data-panel-in className="flex items-center justify-between">
              <span className="font-wide text-sm font-black uppercase tracking-[0.12em] text-cloud">
                {String(i + 1).padStart(2, '0')} · {p.k}
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-subtle">{p.exp}</span>
            </div>
            <h3 data-panel-in className="mt-5 text-2xl font-semibold tracking-tight text-cloud">
              {p.title}
            </h3>
            <p data-panel-in className="mt-2 text-sm leading-relaxed text-fg-muted">
              {p.body}
            </p>
            <div data-panel-in className="my-auto pt-6">
              {p.viz}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
